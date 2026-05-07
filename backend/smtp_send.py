import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path


LOGGER = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent

# Настройки SMTP (захардкожены)
SMTP_HOST = "smtp.crocomim.ru"
SMTP_PORT = 587
SMTP_USER = "hi@crocomim.ru"
SMTP_PASSWORD = "q8wRZ06k"
DEFAULT_TO_EMAIL = "hi@crocomim.ru"


def send_email(subject: str, body: str, to_email: str | None = None) -> None:
    smtp_host = SMTP_HOST
    smtp_port = SMTP_PORT
    smtp_user = SMTP_USER
    smtp_password = SMTP_PASSWORD
    default_to_email = DEFAULT_TO_EMAIL

    from_email = smtp_user
    recipient = to_email if to_email is not None else default_to_email

    LOGGER.info(
        "Preparing email. Host=%s:%s, From=%s, To=%s", smtp_host, smtp_port, from_email, recipient
    )
    # формируем письмо
    msg = MIMEMultipart()
    msg["From"] = from_email
    msg["To"] = recipient
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    # отправка

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        LOGGER.debug("Starting TLS with SMTP server")
        server.starttls()
        LOGGER.debug("Logging in as %s", smtp_user)
        server.login(smtp_user, smtp_password)
        server.sendmail(from_email, recipient, msg.as_string())

    LOGGER.info("Письмо успешно отправлено на %s", recipient)

