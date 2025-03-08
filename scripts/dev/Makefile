.PHONY: dev db check-db

# Start both database and Next.js development server
dev: db check-db
	next dev -p 3001

# Start Docker Compose in detached mode
db:
	cd ./containers/database && docker-compose up -d

# Check if database container is healthy
check-db:
	@echo "Waiting for database to be ready..."
	@until docker-compose -f ./containers/database/docker-compose.yml ps | grep "healthy"; do \
		echo "Waiting for database..."; \
		sleep 1; \
	done
	@echo "Database is ready!" 