# Inject the current CI installer into a release Dockerfile, including old tags.
/^[[:space:]]*RUN[[:space:]]+(--mount=[^[:space:]]+[[:space:]]+)*npm[[:space:]]+ci([[:space:]]|$)/ && !configured {
  print "ARG CI_NPM_REGISTRIES"
  print "ARG CI_NPM_INSTALL_TIMEOUT=180"
  print "ENV CI_NPM_REGISTRIES=$CI_NPM_REGISTRIES"
  print "ENV CI_NPM_INSTALL_TIMEOUT=$CI_NPM_INSTALL_TIMEOUT"
  # Base64 carries the script without Dockerfile/shell interpolation of its body.
  print "RUN printf '%s' '" install_script "' | base64 -d > /usr/local/bin/viewport-npm-ci"
  sub(/npm[[:space:]]+ci/, "sh /usr/local/bin/viewport-npm-ci")
  configured = 1
}
{ print }
END { if (!configured) exit 1 }
