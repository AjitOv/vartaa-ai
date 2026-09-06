#!/bin/bash
# Vartaa AI — one-click deploy to Netlify. Double-click this file (or: bash deploy.command)
cd "$(dirname "$0")"
SITE=f9808376-313b-416a-bee8-90811e749bb2
echo "== Vartaa AI deploy =="
echo "1/3 Netlify login (opens browser if needed)…"
npx -y netlify-cli status --site $SITE >/dev/null 2>&1 || npx -y netlify-cli login
echo
read -r -s -p "2/3 Paste your GEMINI_API_KEY (input hidden, press Enter; leave empty to keep existing): " KEY; echo
if [ -n "$KEY" ]; then npx -y netlify-cli env:set GEMINI_API_KEY "$KEY" --site $SITE; fi
echo "3/3 Deploying…"
npx -y netlify-cli deploy --prod --site $SITE --dir public --functions netlify/functions
echo
echo "Done → https://vartaa-ai-app.netlify.app   (check: https://vartaa-ai-app.netlify.app/api/health)"
read -r -p "Press Enter to close."
