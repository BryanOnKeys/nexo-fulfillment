#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
 --set=ops_password="$PG_OPERATIONS_PASSWORD" \
 --set=docs_password="$PG_DOCUMENTS_PASSWORD" \
 --set=notifications_password="$PG_NOTIFICATIONS_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE nexo_operations LOGIN PASSWORD %L', :'ops_password') \gexec
SELECT format('CREATE ROLE nexo_documents LOGIN PASSWORD %L', :'docs_password') \gexec
SELECT format('CREATE ROLE nexo_notifications LOGIN PASSWORD %L', :'notifications_password') \gexec
CREATE DATABASE nexo_operations OWNER nexo_operations;
CREATE DATABASE nexo_documents OWNER nexo_documents;
CREATE DATABASE nexo_notifications OWNER nexo_notifications;
REVOKE ALL ON DATABASE nexo_operations FROM PUBLIC;
REVOKE ALL ON DATABASE nexo_documents FROM PUBLIC;
REVOKE ALL ON DATABASE nexo_notifications FROM PUBLIC;
SQL
