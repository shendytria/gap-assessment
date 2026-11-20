package store

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"gapapp/internal/httpx"

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
		       a.assigned_user_id, u_as.full_name,
		       CASE
		           WHEN a.result = 'PENDING' AND EXISTS (
		               SELECT 1 FROM approval prev
		               WHERE prev.gap_id = a.gap_id
		                 AND prev.stage = a.stage
		                 AND prev.cycle_no = a.cycle_no
		                 AND prev.step_seq < a.step_seq
		                 AND prev.result <> 'APPROVED'
		                 AND prev.result <> 'SKIPPED'
		           ) THEN 'WAITING'
		           ELSE a.result::text
		       END AS display_result,
		       COALESCE(a.notes,''),
		       CASE
		           WHEN a.on_behalf_of_user_id IS NOT NULL AND u_obo.full_name IS NOT NULL
		           THEN u_act.full_name || ' (on behalf of ' || u_obo.full_name || ')'
		           ELSE COALESCE(u_act.full_name, '')
		       END AS acted_by_name,
		       a.acted_at, a.created_at,
		       (a.result = 'PENDING'
		        AND g.workflow_status <> 'ARCHIVED'
		        AND (a.assigned_user_id = $1 OR dl.delegate_user_id IS NOT NULL)
		        AND NOT EXISTS (
		            SELECT 1 FROM approval prev
		            WHERE prev.gap_id = a.gap_id
		              AND prev.stage = a.stage
		              AND prev.cycle_no = a.cycle_no
		              AND prev.step_seq < a.step_seq
		              AND prev.result <> 'APPROVED'
		              AND prev.result <> 'SKIPPED'
		        )) AS can_act
		FROM approval a
		JOIN gap_document g ON g.gap_id = a.gap_id
		JOIN regulation r ON r.regulation_id = g.regulation_id
		JOIN site s ON s.site_id = g.site_id
		JOIN category c ON c.category_id = g.category_id
		JOIN role ro ON ro.role_id = a.role_id
		LEFT JOIN department d ON d.department_id = a.department_id
		JOIN users u_as ON u_as.user_id = a.assigned_user_id
		LEFT JOIN users u_act ON u_act.user_id = a.acted_by_user_id
		LEFT JOIN users u_obo ON u_obo.user_id = a.on_behalf_of_user_id
		LEFT JOIN delegation dl ON dl.original_user_id = a.assigned_user_id
		                        AND dl.delegate_user_id = $1
		                        AND dl.is_active = TRUE
		                        AND (dl.start_date IS NULL OR dl.start_date::date <= CURRENT_DATE)
		                        AND (dl.ended_at IS NULL OR dl.ended_at >= now())
		WHERE ($2 = FALSE OR (
		    a.result = 'PENDING'
		    AND g.workflow_status <> 'ARCHIVED'
		    AND (a.assigned_user_id = $1 OR dl.delegate_user_id IS NOT NULL)
		    AND NOT EXISTS (
		        SELECT 1 FROM approval prev
		        WHERE prev.gap_id = a.gap_id
		          AND prev.stage = a.stage
		          AND prev.cycle_no = a.cycle_no
		          AND prev.step_seq < a.step_seq
		          AND prev.result <> 'APPROVED'
		          AND prev.result <> 'SKIPPED'
		    )
		))
		ORDER BY g.gap_id DESC, a.cycle_no DESC, (CASE WHEN a.stage = 'STAGE1' THEN 1 ELSE 2 END) ASC, a.step_seq ASC, a.role_id ASC, a.approval_id ASC`
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
		var stage, wfStatus string
		err := tx.QueryRow(ctx, `
			SELECT a.assigned_user_id, a.gap_id, a.cycle_no, a.step_seq, a.stage::text, g.workflow_status::text
			FROM approval a
			JOIN gap_document g ON g.gap_id = a.gap_id
			WHERE a.approval_id = $1 AND a.result = 'PENDING'
			FOR UPDATE OF a, g`, approvalID).Scan(&assignedUID, &gapID, &cycle, &stepSeq, &stage, &wfStatus)
		if err != nil {
			return httpx.NewError(http.StatusConflict, "ALREADY_PROCESSED", "Approval tidak ditemukan atau sudah diproses.")
		}
		if wfStatus == "ARCHIVED" {
			_, _ = tx.Exec(ctx, `UPDATE approval SET result = 'SKIPPED' WHERE gap_id = $1 AND result = 'PENDING'`, gapID)
			return httpx.NewError(http.StatusConflict, "DOCUMENT_ARCHIVED", "This document has already been archived (replaced by a newer revision) and cannot be processed anymore.")
		}
		if (stage == "STAGE1" && wfStatus != "APPROVAL_STAGE1") || (stage == "STAGE2" && wfStatus != "APPROVAL_STAGE2") {
			return httpx.NewError(http.StatusConflict, "INVALID_STATE", fmt.Sprintf("The document is currently in status %s, not in stage %s.", wfStatus, stage))
		}

		// Enforce sequential approval order: all previous steps in the same cycle must already be approved or skipped
		var priorUnapprovedCount int
		_ = tx.QueryRow(ctx, `
			SELECT COUNT(*)::int
			FROM approval
			WHERE gap_id = $1 AND stage = $2::approval_stage AND cycle_no = $3
			  AND step_seq < $4 AND result <> 'APPROVED' AND result <> 'SKIPPED'`,
			gapID, stage, cycle, stepSeq).Scan(&priorUnapprovedCount)
		if priorUnapprovedCount > 0 {
			return httpx.NewError(http.StatusConflict, "NOT_YOUR_TURN",
				"Approval is carried out sequentially. The previous stage has not been approved yet.")
		}

		// Check if actor is assigned user or valid delegate
		var onBehalfOf *int
		if actorUserID != assignedUID {
			var isDelegate bool
			_ = tx.QueryRow(ctx, `
				SELECT TRUE FROM delegation
				WHERE original_user_id = $1 AND delegate_user_id = $2
				  AND is_active = TRUE
				  AND (start_date IS NULL OR start_date::date <= CURRENT_DATE)
				  AND (ended_at IS NULL OR ended_at >= now()) LIMIT 1`, assignedUID, actorUserID).Scan(&isDelegate)
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
				// Reset verified action plans back to IN_PROGRESS so PIC can re-submit updated evidence
				_, _ = tx.Exec(ctx, `
					UPDATE action_plan ap
					SET execution_status = 'IN_PROGRESS',
					    progress_pct = 50,
					    close_date = NULL,
					    verified_by = NULL,
					    verified_at = NULL
					FROM gap_analysis ga
					WHERE ap.gap_analysis_id = ga.gap_analysis_id AND ga.gap_id = $1`, gapID)
				_, _ = tx.Exec(ctx, `
					UPDATE evidence ev
					SET is_superseded = TRUE
					FROM action_plan ap
					JOIN gap_analysis ga ON ga.gap_analysis_id = ap.gap_analysis_id
					WHERE ev.action_plan_id = ap.action_plan_id AND ga.gap_id = $1 AND ev.is_superseded = FALSE`, gapID)
				// Reset gap_analysis.status back to proposed_status (or 50%/0%) so it is no longer 100% after rejection
				_, _ = tx.Exec(ctx, `
					UPDATE gap_analysis ga
					SET status = COALESCE(ga.proposed_status,
					    CASE WHEN ga.in_procedure = FALSE AND ga.in_practice = FALSE THEN '0'::gap_status ELSE '50'::gap_status END),
					    verification_notes = NULL,
					    verified_by = NULL,
					    verified_at = NULL
					WHERE ga.gap_id = $1 AND ga.is_applicable = TRUE`, gapID)
			}
			_, _ = tx.Exec(ctx, `
				UPDATE approval
				SET result = 'SKIPPED'
				WHERE gap_id = $1 AND stage = $2::approval_stage AND cycle_no = $3 AND result = 'PENDING' AND approval_id <> $4`,
				gapID, stage, cycle, approvalID)

			_, err = tx.Exec(ctx, `
				UPDATE gap_document
				SET workflow_status = $2::gap_workflow_status,
				    approval_cycle = $3,
				    return_notes = NULLIF($4,''),
				    returned_at = now(),
				    returned_by = $5
				WHERE gap_id = $1`, gapID, targetWorkflow, newCycle, notes, actorUserID)
			if err != nil {
				return err
			}

			var gapNo string
			var docSiteID int
			if tx.QueryRow(ctx, `SELECT gap_no, site_id FROM gap_document WHERE gap_id = $1`, gapID).Scan(&gapNo, &docSiteID) == nil {
				if stage == "STAGE1" {
					_ = notifyPICForActionPlanTx(ctx, tx, gapID, gapNo, docSiteID,
						fmt.Sprintf("[%s] Stage 1 Ditolak - Revisi Action Plan", gapNo),
						fmt.Sprintf("Document %s rejected at Approval Stage 1 (%s). Please revise the Action Plan.", gapNo, notes))
					_ = notifySupervisorsForSiteTx(ctx, tx, docSiteID, "APPROVAL_REJECTED", &gapID, nil,
						fmt.Sprintf("[%s] Stage 1 Ditolak", gapNo),
						fmt.Sprintf("Document %s rejected at Approval Stage 1 (%s) and returned to PIC Area.", gapNo, notes))
				} else if stage == "STAGE2" {
					_ = notifyPICForActionPlanTx(ctx, tx, gapID, gapNo, docSiteID,
						fmt.Sprintf("[%s] Stage 2 Ditolak - Revisi Evidence", gapNo),
						fmt.Sprintf("Evidence document %s rejected at Approval Stage 2 (%s). Please update the evidence in the Execution section.", gapNo, notes))
					_ = notifySupervisorsForSiteTx(ctx, tx, docSiteID, "APPROVAL_REJECTED", &gapID, nil,
						fmt.Sprintf("[%s] Stage 2 Ditolak", gapNo),
						fmt.Sprintf("Approval Stage 2 document %s rejected (%s) and returned to the Execution stage.", gapNo, notes))
				}
			}
			return nil
		}

		// If approved, check if all steps for current cycle are completed
		var pendingInCycle int
		_ = tx.QueryRow(ctx, `
			SELECT COUNT(*)::int
			FROM approval
			WHERE gap_id = $1 AND cycle_no = $2 AND stage = $3::approval_stage AND result = 'PENDING'`,
			gapID, cycle, stage).Scan(&pendingInCycle)

		var gapNo string
		var docSiteID int
		_ = tx.QueryRow(ctx, `SELECT gap_no, site_id FROM gap_document WHERE gap_id = $1`, gapID).Scan(&gapNo, &docSiteID)

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
						SET workflow_status = 'EXECUTION', stage1_approved_at = now(),
						    return_notes = NULL, returned_at = NULL, returned_by = NULL
						WHERE gap_id = $1`, gapID)
					if gapNo != "" {
						_ = notifyPICForActionPlanTx(ctx, tx, gapID, gapNo, docSiteID,
							fmt.Sprintf("[%s] Approved Stage 1 - Mulai Execution", gapNo),
							fmt.Sprintf("Document %s has been approved at Stage 1. Please execute the Action Plan and upload evidence in the Execution section.", gapNo))
						_ = notifySupervisorsForSiteTx(ctx, tx, docSiteID, "STAGE1_APPROVED", &gapID, nil,
							fmt.Sprintf("[%s] Approved Stage 1", gapNo),
							fmt.Sprintf("Document %s has completed Approval Stage 1 and moved to the Execution stage.", gapNo))
						_ = notifyStaffForSiteTx(ctx, tx, docSiteID, "STAGE1_APPROVED", &gapID,
							fmt.Sprintf("[%s] Approved Stage 1", gapNo),
							fmt.Sprintf("Document %s has completed Approval Stage 1.", gapNo))
					}
				} else {
					// All 100% -> Skip Stage 2 and close directly!
					_, _ = tx.Exec(ctx, `
						UPDATE gap_document
						SET workflow_status = 'CLOSED', stage1_approved_at = now(), closed_at = now(),
						    return_notes = NULL, returned_at = NULL, returned_by = NULL
						WHERE gap_id = $1`, gapID)
					if gapNo != "" {
						_ = notifyAllStakeholdersClosedTx(ctx, tx, gapID, gapNo, docSiteID)
					}
				}
			} else if stage == "STAGE2" {
				_, _ = tx.Exec(ctx, `
					UPDATE gap_document
					SET workflow_status = 'CLOSED', closed_at = now(),
					    return_notes = NULL, returned_at = NULL, returned_by = NULL
					WHERE gap_id = $1`, gapID)
				if gapNo != "" {
					_ = notifyAllStakeholdersClosedTx(ctx, tx, gapID, gapNo, docSiteID)
				}
			}
		} else {
			// Notify all newly eligible pending approvers in the next step (e.g. Co Gap Manager or all parallel managers)
			rowsNext, errNext := tx.Query(ctx, `
				SELECT DISTINCT a.assigned_user_id, ro.role_name
				FROM approval a
				JOIN role ro ON ro.role_id = a.role_id
				WHERE a.gap_id = $1 AND a.stage = $2::approval_stage AND a.cycle_no = $3
				  AND a.result = 'PENDING'
				  AND NOT EXISTS (
				      SELECT 1 FROM approval prev
				      WHERE prev.gap_id = a.gap_id AND prev.stage = a.stage AND prev.cycle_no = a.cycle_no
				        AND prev.step_seq < a.step_seq AND prev.result <> 'APPROVED' AND prev.result <> 'SKIPPED'
				  )`, gapID, stage, cycle)
			if errNext == nil && gapNo != "" {
				type nextApprover struct {
					uid      int
					roleName string
				}
				var nextApprovers []nextApprover
				for rowsNext.Next() {
					var nextUID int
					var nextRoleName string
					if rowsNext.Scan(&nextUID, &nextRoleName) == nil {
						nextApprovers = append(nextApprovers, nextApprover{nextUID, nextRoleName})
					}
				}
				rowsNext.Close()

				for _, na := range nextApprovers {
					_ = insertNotificationTx(ctx, tx, "APPROVAL_PENDING", na.uid, &gapID, nil,
						fmt.Sprintf("[%s] Awaiting Approval %s", gapNo, stage),
						fmt.Sprintf("Document %s is awaiting your signature/approval at stage %s (%s).", gapNo, stage, na.roleName))
				}
			}
		}

		return nil
	})
}

// createApprovalChainTx creates approval rows for STAGE1 or STAGE2 and queues notifications for assigned approvers.
func createApprovalChainTx(ctx context.Context, tx pgx.Tx, gapID int, gapNo string, stage string, cycle int, siteID int, reqQA bool) error {
	// Step 1: Manager Area for all involved departments on the document site
	deptRows, err := tx.Query(ctx, `
		SELECT DISTINCT d.department_id, d.department_name, u.user_id, r.role_id
		FROM (
			SELECT gd.department_id AS dept_id
			FROM gap_analysis ga
			JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
			JOIN gap_analysis_dept gd ON gd.gap_analysis_id = ga.gap_analysis_id
			WHERE ga.gap_id = $1 AND ga.is_applicable = TRUE AND rc.is_info = FALSE
			UNION
			SELECT ga.dept_in_control_id AS dept_id
			FROM gap_analysis ga
			JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
			WHERE ga.gap_id = $1 AND ga.is_applicable = TRUE AND rc.is_info = FALSE AND ga.dept_in_control_id IS NOT NULL
			UNION
			SELECT gco.department_id AS dept_id
			FROM gap_analysis ga
			JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
			JOIN gap_analysis_co_dept gco ON gco.gap_analysis_id = ga.gap_analysis_id
			WHERE ga.gap_id = $1 AND ga.is_applicable = TRUE AND rc.is_info = FALSE
			UNION
			SELECT d2.department_id AS dept_id
			FROM gap_analysis ga
			JOIN regulation_clause rc ON rc.clause_id = ga.clause_id
			CROSS JOIN department d2
			WHERE ga.gap_id = $1 AND ga.is_applicable = TRUE AND rc.is_info = FALSE
			  AND (ga.dept_in_control_all OR ga.co_dept_all) AND d2.site_id = $2 AND d2.is_active = TRUE
		) inv
		JOIN department d ON d.department_id = inv.dept_id AND d.site_id = $2
		LEFT JOIN (
			users u
			JOIN role r ON r.role_id = u.role_id AND r.role_code = 'MANAGER_AREA' AND u.is_active = TRUE
		) ON u.department_id = d.department_id AND u.site_id = $2`, gapID, siteID)
	if err != nil {
		return err
	}
	defer deptRows.Close()

	type mgrTarget struct{ deptID, userID, roleID int }
	var mgrTargets []mgrTarget
	deptHasMgr := map[int]bool{}
	deptNames := map[int]string{}
	for deptRows.Next() {
		var dID int
		var dName string
		var uID, rID *int
		if err := deptRows.Scan(&dID, &dName, &uID, &rID); err != nil {
			return err
		}
		deptNames[dID] = dName
		if uID != nil && rID != nil {
			deptHasMgr[dID] = true
			mgrTargets = append(mgrTargets, mgrTarget{dID, *uID, *rID})
		}
	}
	if err := deptRows.Err(); err != nil {
		return err
	}

	var missingDepts []string
	for dID, dName := range deptNames {
		if !deptHasMgr[dID] {
			missingDepts = append(missingDepts, dName)
		}
	}
	if len(missingDepts) > 0 {
		return httpx.NewError(http.StatusBadRequest, "MISSING_APPROVER",
			fmt.Sprintf("Cannot submit approval: Department (%s) at this site does not have an active Manager Area user. Please register a Manager Area user in the Settings menu first.", strings.Join(missingDepts, ", ")))
	}
	if len(mgrTargets) == 0 {
		return httpx.NewError(http.StatusBadRequest, "MISSING_APPROVER",
			"Cannot submit approval: There are no related departments or Manager Area users for this document.")
	}

	notifiedUsers := map[int]bool{}
	for _, mt := range mgrTargets {
		if _, err := tx.Exec(ctx, `
			INSERT INTO approval (gap_id, stage, cycle_no, step_seq, role_id, department_id, assigned_user_id, result)
			VALUES ($1, $2::approval_stage, $3, 1, $4, $5, $6, 'PENDING')
			ON CONFLICT DO NOTHING`, gapID, stage, cycle, mt.roleID, mt.deptID, mt.userID); err != nil {
			return err
		}
		if !notifiedUsers[mt.userID] {
			notifiedUsers[mt.userID] = true
			_ = insertNotificationTx(ctx, tx, "APPROVAL_PENDING", mt.userID, &gapID, nil,
				fmt.Sprintf("[%s] Awaiting Approval %s", gapNo, stage),
				fmt.Sprintf("Document %s is awaiting your signature/approval at stage %s.", gapNo, stage))
		}
	}

	// Step 2: Co Gap Manager (Quality System)
	var coGapMgrID, coGapRoleID int
	err = tx.QueryRow(ctx, `
		SELECT u.user_id, r.role_id FROM users u
		JOIN role r ON r.role_id = u.role_id
		WHERE r.role_code = 'CO_GAP_MANAGER' AND u.is_active = TRUE LIMIT 1`).Scan(&coGapMgrID, &coGapRoleID)
	if err != nil {
		return httpx.NewError(http.StatusBadRequest, "MISSING_APPROVER",
			"Cannot submit approval: There is no active user with the role Co Gap Manager (Quality System).")
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO approval (gap_id, stage, cycle_no, step_seq, role_id, assigned_user_id, result)
		VALUES ($1, $2::approval_stage, $3, 2, $4, $5, 'PENDING')
		ON CONFLICT DO NOTHING`, gapID, stage, cycle, coGapRoleID, coGapMgrID); err != nil {
		return err
	}

	// Step 3: QA Manager (site) - mandatory for Quality / Manufacturing / Halal, skipped if HSE
	var qaMgrID, qaRoleID int
	err = tx.QueryRow(ctx, `
		SELECT u.user_id, r.role_id FROM users u
		JOIN role r ON r.role_id = u.role_id
		WHERE r.role_code = 'QA_MANAGER' AND u.site_id = $1 AND u.is_active = TRUE LIMIT 1`, siteID).Scan(&qaMgrID, &qaRoleID)
	if reqQA {
		if err != nil {
			var siteCode string
			_ = tx.QueryRow(ctx, `SELECT site_code FROM site WHERE site_id = $1`, siteID).Scan(&siteCode)
			return httpx.NewError(http.StatusBadRequest, "MISSING_APPROVER",
				fmt.Sprintf("Cannot submit approval: There is no active user with the role QA Manager on site %s.", siteCode))
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO approval (gap_id, stage, cycle_no, step_seq, role_id, assigned_user_id, result)
			VALUES ($1, $2::approval_stage, $3, 3, $4, $5, 'PENDING')
			ON CONFLICT DO NOTHING`, gapID, stage, cycle, qaRoleID, qaMgrID); err != nil {
			return err
		}
	} else if err == nil {
		if _, err := tx.Exec(ctx, `
			INSERT INTO approval (gap_id, stage, cycle_no, step_seq, role_id, assigned_user_id, result)
			VALUES ($1, $2::approval_stage, $3, 3, $4, $5, 'SKIPPED')
			ON CONFLICT DO NOTHING`, gapID, stage, cycle, qaRoleID, qaMgrID); err != nil {
			return err
		}
	}

	// Step 4: QO Head (only Stage 1 per WI)
	if stage == "STAGE1" {
		var qoHeadID, qoRoleID int
		err = tx.QueryRow(ctx, `
			SELECT u.user_id, r.role_id FROM users u
			JOIN role r ON r.role_id = u.role_id
			WHERE r.role_code = 'QO_HEAD' AND u.is_active = TRUE LIMIT 1`).Scan(&qoHeadID, &qoRoleID)
		if err != nil {
			return httpx.NewError(http.StatusBadRequest, "MISSING_APPROVER",
				"Cannot submit approval: There is no active user with the role QO Head.")
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO approval (gap_id, stage, cycle_no, step_seq, role_id, assigned_user_id, result)
			VALUES ($1, $2::approval_stage, $3, 4, $4, $5, 'PENDING')
			ON CONFLICT DO NOTHING`, gapID, stage, cycle, qoRoleID, qoHeadID); err != nil {
			return err
		}
	}
	return nil
}
