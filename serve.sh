#!/bin/sh
npx browser-sync start --server --port 8000 --files "index.html, assets/**/*.svg, **/*.css, **/*.js"
