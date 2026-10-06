#!/bin/sh
# SPDX-FileCopyrightText: 2026 Philippe Vollenweider
# SPDX-License-Identifier: AGPL-3.0-only
# Questions/hours-only macOS launcher. AppleLanguages is scoped to this process's
# argument domain; no defaults, system language or existing profile is changed.
exec "/Users/pol/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" -AppleLanguages '(fr)' "$@"
