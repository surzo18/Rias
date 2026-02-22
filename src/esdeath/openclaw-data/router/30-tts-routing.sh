#!/bin/sh
# Runs after 20-envsubst-on-templates.sh in nginx entrypoint.
# When TTS_UPSTREAM=openai, route ALL /v1/* to OpenAI (including TTS).
# Otherwise, the template-based config splits TTS to local backend.

if [ "$TTS_UPSTREAM" = "openai" ]; then
  cat > /etc/nginx/conf.d/default.conf <<'EOF'
server {
  listen 8080;

  location = /health {
    return 200 "ok\n";
    add_header Content-Type text/plain;
  }

  # All /v1/* routes go to OpenAI API (including audio/speech TTS).
  location /v1/ {
    proxy_pass https://api.openai.com;
    proxy_ssl_server_name on;
    proxy_set_header Host api.openai.com;
    proxy_set_header Connection "";
    proxy_request_buffering on;
    proxy_buffering off;
  }
}
EOF
  echo "TTS routing: OpenAI direct (TTS_UPSTREAM=openai)"
fi
