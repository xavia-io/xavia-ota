# Storage & Database Configuration

## Supported Storage Providers
Xavia OTA supports multiple storage backends for storing update assets. Configure using `BLOB_STORAGE_TYPE`.

### Supabase Storage
```env
BLOB_STORAGE_TYPE=supabase
SUPABASE_URL=your-project-url
SUPABASE_API_KEY=your-service-role-key
SUPABASE_BUCKET_NAME=expo-updates
```
- Requires a Supabase project with storage enabled
- Bucket should be created manually before starting the server

### Local Storage
```env
BLOB_STORAGE_TYPE=local
```
- Stores files directly on the server filesystem
- Useful for development or single-server deployments
- Ensure the path has proper write permissions

### GCS Storage
```env
BLOB_STORAGE_TYPE=gcs
GCP_BUCKET_NAME=your-gcs-bucket-name
```
- Requires a GCP project with GCS bucket enabled
- Bucket should be created manually before starting the server

### AWS S3 Compatible Storage
```env
BLOB_STORAGE_TYPE=s3
S3_REGION=auto
S3_ENDPOINT=your-s3-endpoint
S3_ACCESS_KEY_ID=your-access-key-id
S3_SECRET_ACCESS_KEY=your-secret-access-key
S3_BUCKET_NAME=your-s3-bucket-name
```
- Support all S3 compatible storage (AWS S3, Digital Ocean Spaces, Cloudflare R2, etc.)
- Bucket should be created manually before starting the server

## Supported Database Providers
Database configuration is managed via `DB_TYPE`.

### Supabase Database
```env
DB_TYPE=supabase
SUPABASE_URL=your-project-url
SUPABASE_API_KEY=your-service-role-key
```
- Uses Supabase's PostgreSQL database
- Tables should be created manually before starting the server. Refer to the `containers/database/schema` folder for reference.

### PostgreSQL
```env
DB_TYPE=postgres
POSTGRES_USER=your-user
POSTGRES_PASSWORD=your-password
POSTGRES_DB=your-database-name
POSTGRES_HOST=your-host
POSTGRES_PORT=your-port
```
- Direct PostgreSQL connection
- Supports any PostgreSQL-compatible database
- Tables should be created manually before starting the server. Refer to the `containers/database/schema` folder for reference.
