# Use a Python image with uv pre-installed
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

# Set the working directory to /app
WORKDIR /app

# Enable bytecode compilation
ENV UV_COMPILE_BYTECODE=1

# Copy the lockfile and pyproject.toml
COPY uv.lock pyproject.toml /app/

# Install the project's dependencies using the lockfile and settings
RUN uv sync --frozen --no-install-project --no-dev

# Copy the rest of the source code into the image
COPY . /app

# Install the project itself
RUN uv sync --frozen --no-dev

# Place the virtualenv's binary path in the PATH
ENV PATH="/app/.venv/bin:$PATH"

# Run the application
# Cloud Run expects the app to listen on PORT environment variable
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
