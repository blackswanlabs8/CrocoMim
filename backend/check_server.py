#!/usr/bin/env python3
"""CLI utility to perform sanity checks against a CrocoMim backend instance."""

from __future__ import annotations

import argparse
import os
import sys

from .runtime_config import get_backend_base_url, get_public_api_base_url
from .server_checks import check_health, send_test_feedback


def _resolve_default_base_url() -> str:
    return (
        os.environ.get("CROCOMIM_BASE_URL")
        or get_public_api_base_url()
        or get_backend_base_url()
        or "http://localhost:3000"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "base_url",
        nargs="?",
        default=_resolve_default_base_url(),
        help="Base URL of the CrocoMim backend (defaults to runtime configuration)",
    )
    args = parser.parse_args(argv)

    try:
        health_ok = check_health(args.base_url)
        print(f"Health check ({args.base_url}/healthz): {'OK' if health_ok else 'FAILED'}")

        feedback_response = send_test_feedback(args.base_url)
        print("Feedback test response:", feedback_response)

        print("Server is accepting feedback submissions.")
        return 0
    except Exception as exc:  # pragma: no cover - CLI error handling
        print(f"Server check failed: {exc}", file=sys.stderr)
        body = getattr(exc, "body", None)
        if body is not None:
            print("Response body:", body, file=sys.stderr)
        return 1


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(main())
