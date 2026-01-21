@echo off
cd /d %dp0

start cmd /k "npm run preview"
 
start cmd /k "npx tsx automation/saibweb-webhook.ts"

pause