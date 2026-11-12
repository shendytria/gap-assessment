package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

type NotificationItem struct {
	NotificationID int64      `json:"notificationId"`
	EventType      string     `json:"eventType"`
	GapID          *int       `json:"gapId"`
	ActionPlanID   *int64     `json:"actionPlanId"`
	Subject        string     `json:"subject"`
	Body           string     `json:"body"`
	ScheduledAt    time.Time  `json:"scheduledAt"`
	ReadAt         *time.Time `json:"readAt"`
}

func insertNotificationTx(ctx context.Context, tx pgx.Tx, eventType string, recipientUserID int, gapID *int, actionPlanID *int64, subject, body string) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO notification (event_type, recipient_user_id, gap_id, action_plan_id, subject, body, status, sent_at)
		VALUES ($1, $2, $3, $4, $5, $6, 'SENT', now())`,
		eventType, recipientUserID, gapID, actionPlanID, subject, body)
	return err
}

// notifySupervisorsForSiteTx queues/records an in-app notification to active Co Gap Supervisors on the target site
// (falling back to any active Co Gap Supervisor if no site-specific supervisor is assigned).
func notifySupervisorsForSiteTx(ctx context.Context, tx pgx.Tx, siteID int, eventType string, gapID *int, actionPlanID *int64, subject, body string) error {
	rows, err := tx.Query(ctx, `
		SELECT u.user_id
		FROM users u
		JOIN role r ON r.role_id = u.role_id
		WHERE r.role_code = 'CO_GAP_SUPERVISOR' AND u.is_active = TRUE
		  AND (u.site_id = $1 OR NOT EXISTS (
		      SELECT 1 FROM users u2
		      JOIN role r2 ON r2.role_id = u2.role_id
		      WHERE r2.role_code = 'CO_GAP_SUPERVISOR' AND u2.is_active = TRUE AND u2.site_id = $1
		  ))`, siteID)
	if err != nil {
		return err
	}
	var ids []int
	for rows.Next() {
		var uid int
		if rows.Scan(&uid) == nil {
			ids = append(ids, uid)
		}
	}
	rows.Close()
	for _, uid := range ids {
		if err := insertNotificationTx(ctx, tx, eventType, uid, gapID, actionPlanID, subject, body); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) ListNotifications(ctx context.Context, userID int, limit int) ([]NotificationItem, int, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	rows, err := s.Pool.Query(ctx, `
		SELECT notification_id, event_type, gap_id, action_plan_id, subject, body, scheduled_at, read_at
		FROM notification
		WHERE recipient_user_id = $1
		ORDER BY scheduled_at DESC, notification_id DESC
		LIMIT $2`, userID, limit)
	if err != nil {
		return []NotificationItem{}, 0, err
	}
	defer rows.Close()

	items := []NotificationItem{}
	for rows.Next() {
		var it NotificationItem
		if err := rows.Scan(&it.NotificationID, &it.EventType, &it.GapID, &it.ActionPlanID, &it.Subject, &it.Body, &it.ScheduledAt, &it.ReadAt); err != nil {
			return nil, 0, err
		}
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	var unread int
	_ = s.Pool.QueryRow(ctx, `SELECT COUNT(*)::int FROM notification WHERE recipient_user_id = $1 AND read_at IS NULL`, userID).Scan(&unread)
	return items, unread, nil
}

func (s *Store) MarkNotificationRead(ctx context.Context, userID int, notificationID int64) error {
	_, err := s.Pool.Exec(ctx, `
		UPDATE notification
		SET read_at = COALESCE(read_at, now())
		WHERE notification_id = $1 AND recipient_user_id = $2`, notificationID, userID)
	return err
}

func (s *Store) MarkAllNotificationsRead(ctx context.Context, userID int) error {
	_, err := s.Pool.Exec(ctx, `
		UPDATE notification
		SET read_at = now()
		WHERE recipient_user_id = $1 AND read_at IS NULL`, userID)
	return err
}
