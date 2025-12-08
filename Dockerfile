# Build Stage for Frontend
FROM node:20-alpine as build-frontend

WORKDIR /app/frontend

# Copy dependencies first for caching
COPY frontend/package*.json ./
RUN npm install

# Copy source and build
COPY frontend/ .
RUN npm run build

# Runtime Stage for Backend
# Use Python 3.12 to match pyproject.toml requirements
FROM python:3.12-slim

# Create a non-root user and group
RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app/backend

# Install uv for fast dependency management
RUN pip install uv

# Copy backend dependencies
COPY backend/pyproject.toml backend/uv.lock ./

# Install dependencies into system python using uv (faster, better wheel handling)
RUN uv export --frozen --format=requirements-txt | uv pip install --system --no-cache -r /dev/stdin

# Copy backend code
COPY backend/ .

# Copy built frontend static files to backend/static
COPY --from=build-frontend /app/frontend/dist ./static

# Change ownership of the application directory to the non-root user
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8080

# Run the application (uvicorn is now in system PATH)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
