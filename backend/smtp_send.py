import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from dotenv import load_dotenv


LOGGER = logging.getLogger(__name__)

load_dotenv()  # грузим переменные из .env


def send_email(subject: str, body: str, to_email: str | None = None) -> None:
    smtp_host = os.getenv("SMTP_HOST", "smtp.crocomim.ru")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))

    smtp_user = os.getenv("SMTP_USER", "hi@crocomim.ru")
    smtp_password = os.getenv("SMTP_PASSWORD")
    default_to_email = os.getenv("DEFAULT_TO_EMAIL", "hi@crocomim.ru")

    if not smtp_password:
        raise RuntimeError("SMTP_PASSWORD не задан в .env")

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
