# Stage 1: Build the React frontend
FROM node:18-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build the Flask backend and serve
FROM python:3.9-slim
WORKDIR /app/backend

# Install backend dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./

# Copy built frontend from Stage 1
COPY --from=frontend-build /app/frontend/build /app/frontend/build

# Expose port
EXPOSE 5000

# Start Gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]
