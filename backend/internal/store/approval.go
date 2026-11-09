package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

type ApprovalTask struct {
	ApprovalID       int64      `json:"approvalId"`
	GapID            int        `json:"gapId"`
	GapNo            string     `json:"gapNo"`
	RegulationTitle  string     `json:"regulationTitle"`
	LegalNumber      string     `json:"legalNumber"`
	SiteCode         string     `json:"siteCode"`
	CategoryCode     string     `json:"categoryCode"`
	Stage            string     `json:"stage"` // 'STAGE1', 'STAGE2', 'MASTER_LIST'
	CycleNo          int        `json:"cycleNo"`
	StepSeq          int        `json:"stepSeq"`
	RoleCode         string     `json:"roleCode"`
	RoleName         string     `json:"roleName"`
	DepartmentCode   string     `json:"departmentCode"`
	AssignedUserID   int        `json:"assignedUserId"`
	AssignedUserName string     `json:"assignedUserName"`
	Result           string     `json:"result"` // 'PENDING', 'APPROVED', 'REJECTED', 'SKIPPED'
	Notes            string     `json:"notes"`
	ActedByName      string     `json:"actedByName"`
	ActedAt          *time.Time `json:"actedAt"`
	CreatedAt        time.Time  `json:"createdAt"`
	CanAct           bool       `json:"canAct"`
}

func (s *Store) ListApprovals(ctx context.Context, userID int, onlyPending bool) ([]ApprovalTask, error) {
	query := `
		SELECT a.approval_id, a.gap_id, g.gap_no, r.title, r.legal_number,
		       s.site_code, c.category_code, a.stage::text, a.cycle_no, a.step_seq,
		       ro.role_code, ro.role_name, COALESCE(d.department_code,''),
		       a.assigned_user_id, u_as.full_name, a.result::text,
		       COALESCE(a.notes,''), COALESCE(u_act.full_name,''), a.acted_at, a.created_at,
		       (a.result = 'PENDING' AND (a.assigned_user_id = $1 OR dl.delegate_user_id IS NOT NULL)) AS can_act
		FROM approval a
		JOIN gap_document g ON g.gap_id = a.gap_id
		JOIN regulation r ON r.regulation_id = g.regulation_id
		JOIN site s ON s.site_id = g.site_id
		JOIN category c ON c.category_id = g.category_id
		JOIN role ro ON ro.role_id = a.role_id
		LEFT JOIN department d ON d.department_id = a.department_id
		JOIN users u_as ON u_as.user_id = a.assigned_user_id
		LEFT JOIN users u_act ON u_act.user_id = a.acted_by_user_id
		LEFT JOIN delegation dl ON dl.original_user_id = a.assigned_user_id
		                        AND dl.delegate_user_id = $1
		                        AND dl.is_active = TRUE
		                        AND (dl.ended_at IS NULL OR dl.ended_at >= now())
		WHERE ($2 = FALSE OR (a.result = 'PENDING' AND (a.assigned_user_id = $1 OR dl.delegate_user_id IS NOT NULL)))
		ORDER BY a.created_at DESC`
	rows, err := s.Pool.Query(ctx, query, userID, onlyPending)
	if err != nil {
		return []ApprovalTask{}, err
	}
	defer rows.Close()
	out := []ApprovalTask{}
	for rows.Next() {
		var item ApprovalTask
		if err := rows.Scan(&item.ApprovalID, &item.GapID, &item.GapNo, &item.RegulationTitle, &item.LegalNumber,
			&item.SiteCode, &item.CategoryCode, &item.Stage, &item.CycleNo, &item.StepSeq,
			&item.RoleCode, &item.RoleName, &item.DepartmentCode,
			&item.AssignedUserID, &item.AssignedUserName, &item.Result,
			&item.Notes, &item.ActedByName, &item.ActedAt, &item.CreatedAt, &item.CanAct); err != nil {
			return out, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) ActOnApproval(ctx context.Context, actorUserID int, approvalID int64, approve bool, notes string, signatureHash string) error {
	return s.WithTx(ctx, actorUserID, func(tx pgx.Tx) error {
		var assignedUID, gapID, cycle, stepSeq int
		var stage string
		err := tx.QueryRow(ctx, `
			SELECT assigned_user_id, gap_id, cycle_no, step_seq, stage::text
			FROM approval
			WHERE approval_id = $1 AND result = 'PENDING'`, approvalID).Scan(&assignedUID, &gapID, &cycle, &stepSeq, &stage)
		if err != nil {
			return fmt.Errorf("approval not found or already processed")
		}

		// Check if actor is assigned user or valid delegate
		var onBehalfOf *int
		if actorUserID != assignedUID {
			var isDelegate bool
			_ = tx.QueryRow(ctx, `
				SELECT TRUE FROM delegation
				WHERE original_user_id = $1 AND delegate_user_id = $2
				  AND is_active = TRUE AND (ended_at IS NULL OR ended_at >= now()) LIMIT 1`, assignedUID, actorUserID).Scan(&isDelegate)
			if !isDelegate {
				return fmt.Errorf("unauthorized to approve on behalf of user %d", assignedUID)
			}
			onBehalfOf = &assignedUID
		}

		result := "APPROVED"
		if !approve {
			result = "REJECTED"
			if len(notes) == 0 {
				return fmt.Errorf("rejection reason is mandatory")
			}
		}

		_, err = tx.Exec(ctx, `
			UPDATE approval
			SET result = $2::approval_result, acted_by_user_id = $3, on_behalf_of_user_id = $4,
			    notes = NULLIF($5,''), acted_at = now(), signature_meaning = 'ERES Approval',
			    signature_hash = NULLIF($6,'')
			WHERE approval_id = $1`,
			approvalID, result, actorUserID, onBehalfOf, notes, signatureHash)
		if err != nil {
			return err
		}

		if !approve {
			// Increment cycle and return to ACTION_PLAN (Stage 1) or EXECUTION (Stage 2)
			newCycle := cycle + 1
			targetWorkflow := "ACTION_PLAN"
			if stage == "STAGE2" {
				targetWorkflow = "EXECUTION"
			}
			_, err = tx.Exec(ctx, `
				UPDATE gap_document
				SET workflow_status = $2::gap_workflow_status, approval_cycle = $3
				WHERE gap_id = $1`, gapID, targetWorkflow, newCycle)
			return err
		}

		// If approved, check if all steps for current cycle are completed
		var pendingInCycle int
		_ = tx.QueryRow(ctx, `
			SELECT COUNT(*)::int
			FROM approval
			WHERE gap_id = $1 AND cycle_no = $2 AND stage = $3::approval_stage AND result = 'PENDING'`,
			gapID, cycle, stage).Scan(&pendingInCycle)

		if pendingInCycle == 0 {
			// Check if there are any clauses below 100%
			var hasBelow100 bool
			_ = tx.QueryRow(ctx, `
				SELECT EXISTS (
					SELECT 1 FROM gap_analysis
					WHERE gap_id = $1 AND is_applicable AND status IN ('50','0')
				)`, gapID).Scan(&hasBelow100)

			if stage == "STAGE1" {
				if hasBelow100 {
					_, _ = tx.Exec(ctx, `
						UPDATE gap_document
						SET workflow_status = 'EXECUTION', stage1_approved_at = now()
						WHERE gap_id = $1`, gapID)
				} else {
					// All 100% -> Skip Stage 2 and close directly!
					_, _ = tx.Exec(ctx, `
						UPDATE gap_document
						SET workflow_status = 'CLOSED', stage1_approved_at = now(), closed_at = now()
						WHERE gap_id = $1`, gapID)
				}
			} else if stage == "STAGE2" {
				_, _ = tx.Exec(ctx, `
					UPDATE gap_document
					SET workflow_status = 'CLOSED', closed_at = now()
					WHERE gap_id = $1`, gapID)
			}
		}

		return nil
	})
}
