# Protect the single-user dashboard and worker APIs separately

The hosted dashboard will require a single-user password session for all UI access and mutation endpoints, while local capability workers authenticate with a separate rotatable bearer token. Public collection, job, automation, and Manual URL triggers are no longer an accepted risk because Source Enrichment can consume paid quotas and cause the operator's PC to fetch submitted URLs; rate limits and strict public-network URL validation apply in addition to authentication.
