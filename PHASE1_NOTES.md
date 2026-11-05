# Phase 1: AI usage protection

## Apply database migration first
Run `supabase/phase1-ai-usage.sql` in the Supabase SQL Editor before deploying the code. Existing atomic quota RPCs (`consume_analysis_quota`, `consume_cv_quota`, `consume_free_cv_quota`) remain in place; they increment with a guarded SQL UPDATE, preventing concurrent requests from exceeding the limits when the migration has been applied.

## What is recorded
`ai_usage_events` stores provider, model, task, success/failure and *estimated* input/output tokens. Estimates use character count divided by four, not actual billed tokens. Actual token columns are reserved for later provider-reported usage. No CV text, prompt, or secret is saved. Estimated tokens are **not reliable billing or cost figures**; check provider dashboards for charges.

## Provider handling
The CV Fixer retries temporary Gemini 429/5xx errors up to three times before OpenRouter, then optional self-hosted inference, then local fallback. The Analyzer retains its existing retries and fallback chain. Each provider result is validated by existing logic.

## Limitations
Tracking is best-effort: logging failures do not break user requests. It does not provide financial cost totals or enforce a dollar budget. Usage quotas are consumed when a request is accepted, even if AI fails. A full runtime build and live provider/payment tests are still required.

## Test
1. `npm ci` then `npm run build`.
2. Verify free 1/day and paid 10/day analyses, free 1/CV and paid 30/CV fixes, free 1/CV and unlimited paid downloads.
3. Fire concurrent requests at the last quota slot: only one should be accepted.
4. Simulate Gemini 503 and confirm fallback. Check `ai_usage_events` for metadata rows.
