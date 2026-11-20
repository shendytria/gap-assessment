package mailer

import (
	"crypto/tls"
	"fmt"
	"log/slog"
	"net"
	"net/smtp"
	"strconv"
	"strings"
	"time"
)

type Mailer struct {
	Host     string
	Port     int
	User     string
	Pass     string
	Sender   string
	Secure   bool
	Insecure bool // set true for internal enterprise relays with self-signed TLS certificates
}

func New(host string, port int, user, pass, sender string, secure bool) *Mailer {
	return &Mailer{
		Host:   host,
		Port:   port,
		User:   user,
		Pass:   pass,
		Sender: sender,
		Secure: secure,
	}
}

// Send sends an email message. If host is empty, it safely skips sending without error.
func (m *Mailer) Send(to []string, subject, body string, isHTML bool) error {
	if m.Host == "" || len(to) == 0 {
		return nil
	}

	contentType := "text/plain; charset=UTF-8"
	if isHTML {
		contentType = "text/html; charset=UTF-8"
	}

	header := make(map[string]string)
	header["From"] = m.Sender
	header["To"] = strings.Join(to, ", ")
	header["Subject"] = subject
	header["MIME-Version"] = "1.0"
	header["Content-Type"] = contentType
	header["Date"] = time.Now().Format(time.RFC1123Z)

	var msg strings.Builder
	for k, v := range header {
		msg.WriteString(fmt.Sprintf("%s: %s\r\n", k, v))
	}
	msg.WriteString("\r\n" + body)

	addr := net.JoinHostPort(m.Host, strconv.Itoa(m.Port))

	// In background / non-blocking manner
	go func() {
		var auth smtp.Auth
		if m.User != "" && m.Pass != "" {
			auth = smtp.PlainAuth("", m.User, m.Pass, m.Host)
		}

		var err error
		if m.Secure {
			tlsConfig := &tls.Config{
				ServerName:         m.Host,
				InsecureSkipVerify: m.Insecure,
			}
			conn, dialErr := tls.Dial("tcp", addr, tlsConfig)
			if dialErr != nil {
				slog.Warn("smtp tls dial error", "addr", addr, "err", dialErr)
				return
			}
			defer conn.Close()

			c, clientErr := smtp.NewClient(conn, m.Host)
			if clientErr != nil {
				slog.Warn("smtp client creation error", "err", clientErr)
				return
			}
			defer c.Close()

			if auth != nil {
				if err = c.Auth(auth); err != nil {
					slog.Warn("smtp auth error", "err", err)
					return
				}
			}
			if err = c.Mail(m.Sender); err != nil {
				slog.Warn("smtp mail error", "err", err)
				return
			}
			for _, addr := range to {
				if err = c.Rcpt(addr); err != nil {
					slog.Warn("smtp rcpt error", "to", addr, "err", err)
					return
				}
			}
			w, err := c.Data()
			if err != nil {
				slog.Warn("smtp data error", "err", err)
				return
			}
			_, _ = w.Write([]byte(msg.String()))
			_ = w.Close()
			_ = c.Quit()
		} else {
			// Plain SMTP (standard for internal port 25 relay like Kalbe Outlook Protection)
			conn, dialErr := net.DialTimeout("tcp", addr, 5*time.Second)
			if dialErr != nil {
				slog.Warn("smtp dial error", "addr", addr, "err", dialErr)
				return
			}
			c, clientErr := smtp.NewClient(conn, m.Host)
			if clientErr != nil {
				_ = conn.Close()
				slog.Warn("smtp client error", "err", clientErr)
				return
			}
			defer c.Close()

			if auth != nil {
				if err = c.Auth(auth); err != nil {
					slog.Warn("smtp auth error", "err", err)
					return
				}
			}
			if err = c.Mail(m.Sender); err != nil {
				slog.Warn("smtp mail error", "err", err)
				return
			}
			for _, addr := range to {
				if err = c.Rcpt(addr); err != nil {
					slog.Warn("smtp rcpt error", "to", addr, "err", err)
					return
				}
			}
			w, err := c.Data()
			if err != nil {
				slog.Warn("smtp data error", "err", err)
				return
			}
			_, _ = w.Write([]byte(msg.String()))
			_ = w.Close()
			_ = c.Quit()
		}
	}()

	return nil
}
