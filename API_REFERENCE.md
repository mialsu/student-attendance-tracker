# API Reference - Authentication Endpoints

## Base URL
- Development: `http://localhost:8000`
- Production: `https://yourdomain.com`

## Authentication Overview

The API uses JWT (JSON Web Tokens) for authentication:
- **Access Token**: Short-lived (15 minutes), used for API requests
- **Refresh Token**: Long-lived (7 days), used to get new access tokens
- **Authorization Header**: `Authorization: Bearer <access_token>`

## Endpoints

### POST /api/auth/signup
Create a new user account.

**Request Body:**
```json
{
  "email": "teacher@example.com",
  "password": "securepassword123"
}
```

**Response (201 Created):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "teacher@example.com",
    "active": true,
    "created_at": "2025-10-26T12:00:00Z"
  }
}
```

**Errors:**
- `409 Conflict`: Email already registered
- `422 Unprocessable Entity`: Validation error (password too short, invalid email)

---

### POST /api/auth/login
Login with email and password.

**Request Body:**
```json
{
  "email": "teacher@example.com",
  "password": "securepassword123"
}
```

**Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "teacher@example.com",
    "active": true,
    "created_at": "2025-10-26T12:00:00Z"
  }
}
```

**Errors:**
- `401 Unauthorized`: Invalid email or password
- `401 Unauthorized`: Account is inactive

---

### POST /api/auth/refresh
Refresh access token using refresh token.

**Request Body:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "teacher@example.com",
    "active": true,
    "created_at": "2025-10-26T12:00:00Z"
  }
}
```

**Errors:**
- `401 Unauthorized`: Invalid or expired refresh token
- `401 Unauthorized`: Account is inactive

---

### POST /api/auth/logout
Logout current user.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (204 No Content):**
No response body.

**Note:** With JWT tokens, logout is primarily handled client-side by removing tokens. This endpoint validates the token and can be extended for token blacklisting.

**Errors:**
- `401 Unauthorized`: Invalid or missing token

---

### GET /api/auth/me
Get current authenticated user information.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "email": "teacher@example.com",
  "active": true,
  "created_at": "2025-10-26T12:00:00Z"
}
```

**Errors:**
- `401 Unauthorized`: Invalid or missing token
- `401 Unauthorized`: Account is inactive

---

### PUT /api/auth/email
Update user's email address.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "new_email": "newemail@example.com",
  "current_password": "securepassword123"
}
```

**Response (200 OK):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "email": "newemail@example.com",
  "active": true,
  "created_at": "2025-10-26T12:00:00Z"
}
```

**Errors:**
- `401 Unauthorized`: Invalid current password
- `409 Conflict`: New email already in use
- `401 Unauthorized`: Invalid or missing token

---

### PUT /api/auth/password
Update user's password.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "current_password": "oldpassword123",
  "new_password": "newsecurepassword456"
}
```

**Response (204 No Content):**
No response body.

**Errors:**
- `401 Unauthorized`: Invalid current password
- `422 Unprocessable Entity`: New password doesn't meet requirements (min 8 characters)
- `401 Unauthorized`: Invalid or missing token

---

## Testing with cURL

### Signup
```bash
curl -X POST http://localhost:8000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teacher@example.com",
    "password": "password123"
  }'
```

### Login
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teacher@example.com",
    "password": "password123"
  }'
```

### Get Current User (requires token)
```bash
curl -X GET http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE"
```

### Update Email
```bash
curl -X PUT http://localhost:8000/api/auth/email \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "new_email": "newemail@example.com",
    "current_password": "password123"
  }'
```

### Update Password
```bash
curl -X PUT http://localhost:8000/api/auth/password \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "current_password": "password123",
    "new_password": "newpassword456"
  }'
```

### Refresh Token
```bash
curl -X POST http://localhost:8000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "YOUR_REFRESH_TOKEN_HERE"
  }'
```

## Security Features

### Password Requirements
- Minimum 8 characters
- Hashed with bcrypt (never stored in plain text)

### Token Security
- Access tokens expire after 15 minutes
- Refresh tokens expire after 7 days
- Tokens include user ID and email
- Token type validation (access vs refresh)

### Account Status
- Users have an `active` boolean field (default: `true`)
- Inactive accounts cannot login
- Inactive accounts cannot refresh tokens
- All authenticated endpoints check for active status

### Rate Limiting (Nginx - Production)
- Authentication endpoints: 5 requests per minute per IP
- General API endpoints: 10 requests per second per IP

## Error Response Format

All errors follow this format:

```json
{
  "detail": "Error message describing what went wrong"
}
```

Common HTTP status codes:
- `200 OK`: Success
- `201 Created`: Resource created successfully
- `204 No Content`: Success with no response body
- `400 Bad Request`: Invalid request data
- `401 Unauthorized`: Authentication failed or missing
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource already exists (duplicate)
- `422 Unprocessable Entity`: Validation error
- `500 Internal Server Error`: Server error

---

## Classes API

### GET /api/classes
List all classes for the current teacher.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Parameters:**
- `skip` (optional): Number of records to skip (default: 0)
- `limit` (optional): Maximum records to return (1-100, default: 100)

**Response (200 OK):**
```json
[
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "Mathematics 101",
    "description": "Introduction to algebra and geometry",
    "teacher_id": "123e4567-e89b-12d3-a456-426614174000",
    "active": true,
    "created_at": "2025-10-26T12:00:00Z",
    "updated_at": null,
    "attendance_count": 42
  }
]
```

**Errors:**
- `401 Unauthorized`: Invalid or missing token

---

### POST /api/classes
Create a new class.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "name": "Mathematics 101",
  "description": "Introduction to algebra and geometry"
}
```

**Response (201 Created):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "name": "Mathematics 101",
  "description": "Introduction to algebra and geometry",
  "teacher_id": "123e4567-e89b-12d3-a456-426614174000",
  "active": true,
  "created_at": "2025-10-26T12:00:00Z",
  "updated_at": null,
  "attendance_count": 0
}
```

**Errors:**
- `401 Unauthorized`: Invalid or missing token
- `422 Unprocessable Entity`: Validation error (name too short/long)

---

### GET /api/classes/{class_id}
Get details of a specific class.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "name": "Mathematics 101",
  "description": "Introduction to algebra and geometry",
  "teacher_id": "123e4567-e89b-12d3-a456-426614174000",
  "active": true,
  "created_at": "2025-10-26T12:00:00Z",
  "updated_at": "2025-10-27T14:30:00Z",
  "attendance_count": 42
}
```

**Errors:**
- `401 Unauthorized`: Invalid or missing token
- `403 Forbidden`: You don't own this class
- `404 Not Found`: Class not found

---

### PUT /api/classes/{class_id}
Update a class.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "name": "Advanced Mathematics",
  "description": "Updated description",
  "active": false
}
```

Note: All fields are optional. Only provided fields will be updated.

**Response (200 OK):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "name": "Advanced Mathematics",
  "description": "Updated description",
  "teacher_id": "123e4567-e89b-12d3-a456-426614174000",
  "active": false,
  "created_at": "2025-10-26T12:00:00Z",
  "updated_at": "2025-10-27T15:00:00Z",
  "attendance_count": 42
}
```

**Errors:**
- `401 Unauthorized`: Invalid or missing token
- `403 Forbidden`: You don't own this class
- `404 Not Found`: Class not found
- `422 Unprocessable Entity`: Validation error

---

### DELETE /api/classes/{class_id}
Delete a class and all its attendance records.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (204 No Content):**
No response body.

**Errors:**
- `401 Unauthorized`: Invalid or missing token
- `403 Forbidden`: You don't own this class
- `404 Not Found`: Class not found

**Warning:** This action cascades and deletes all attendance records for this class. This cannot be undone.

---

## Classes API - Testing with cURL

### List Classes
```bash
curl -X GET http://localhost:8000/api/classes \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# With pagination
curl -X GET "http://localhost:8000/api/classes?skip=0&limit=10" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Create Class
```bash
curl -X POST http://localhost:8000/api/classes \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mathematics 101",
    "description": "Introduction to algebra"
  }'
```

### Get Class Details
```bash
curl -X GET http://localhost:8000/api/classes/{class_id} \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Update Class
```bash
# Update name and description
curl -X PUT http://localhost:8000/api/classes/{class_id} \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Advanced Mathematics",
    "description": "Updated course"
  }'

# Deactivate class (prevent new attendance)
curl -X PUT http://localhost:8000/api/classes/{class_id} \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active": false
  }'
```

### Delete Class
```bash
curl -X DELETE http://localhost:8000/api/classes/{class_id} \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Class Active Status

The `active` boolean field controls whether new attendance records can be created for a class:

- **`active: true`** (default): New attendance can be recorded
- **`active: false`**: Class is archived, no new attendance can be recorded

**Use Cases:**
- Archive completed courses
- Temporarily disable attendance tracking
- Prevent accidental attendance entries

**Note:** Setting a class to inactive does NOT delete existing attendance records. It only prevents new ones from being created.

---

## Students API

### GET /api/classes/{class_id}/students
List all students for a class with pagination and filters.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Parameters:**
- `skip` (optional): Number of records to skip (default: 0)
- `limit` (optional): Maximum records to return (1-100, default: 100)
- `search` (optional): Search by student name (case-insensitive, partial match)
- `credit_status` (optional): Filter by course credit received (`true`, `false`, or omit for all)

**Response (200 OK):**
```json
{
  "items": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "name": "John Doe",
      "class_id": "123e4567-e89b-12d3-a456-426614174001",
      "course_credit_received": true,
      "created_at": "2025-10-26T12:00:00Z",
      "updated_at": "2025-11-05T14:30:00Z"
    }
  ],
  "total": 25,
  "skip": 0,
  "limit": 100
}
```

**Errors:**
- `401 Unauthorized`: Invalid or missing token
- `403 Forbidden`: You don't own this class
- `404 Not Found`: Class not found

---

### GET /api/classes/{class_id}/students/summary
List students with their total attendance counts.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
[
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "John Doe",
    "course_credit_received": true,
    "total_attendance": 15
  },
  {
    "id": "123e4567-e89b-12d3-a456-426614174001",
    "name": "Jane Smith",
    "course_credit_received": false,
    "total_attendance": 12
  }
]
```

**Errors:**
- `401 Unauthorized`: Invalid or missing token
- `403 Forbidden`: You don't own this class
- `404 Not Found`: Class not found

---

### GET /api/classes/{class_id}/students/autocomplete
Autocomplete student names for quick entry. Returns students ordered by attendance frequency.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Parameters:**
- `q` (required): Search query (minimum 2 characters)
- `limit` (optional): Maximum results to return (1-50, default: 10)

**Response (200 OK):**
```json
[
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "John Doe",
    "total_attendance": 15
  },
  {
    "id": "123e4567-e89b-12d3-a456-426614174001",
    "name": "Johnny Smith",
    "total_attendance": 8
  }
]
```

**Features:**
- Case-insensitive partial matching
- Results ordered by attendance count (most frequent first)
- Minimum 2-character query required

**Errors:**
- `400 Bad Request`: Query too short (< 2 characters)
- `401 Unauthorized`: Invalid or missing token
- `403 Forbidden`: You don't own this class
- `404 Not Found`: Class not found

---

### GET /api/students/{student_id}
Get details of a specific student.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "name": "John Doe",
  "class_id": "123e4567-e89b-12d3-a456-426614174001",
  "course_credit_received": true,
  "created_at": "2025-10-26T12:00:00Z",
  "updated_at": "2025-11-05T14:30:00Z"
}
```

**Errors:**
- `401 Unauthorized`: Invalid or missing token
- `403 Forbidden`: You don't own the class this student belongs to
- `404 Not Found`: Student not found

---

### PUT /api/students/{student_id}
Update a student's name or course credit status.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "name": "John M. Doe",
  "course_credit_received": true
}
```

Note: All fields are optional. Only provided fields will be updated.

**Response (200 OK):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "name": "John M. Doe",
  "class_id": "123e4567-e89b-12d3-a456-426614174001",
  "course_credit_received": true,
  "created_at": "2025-10-26T12:00:00Z",
  "updated_at": "2025-11-05T15:00:00Z"
}
```

**Errors:**
- `400 Bad Request`: Duplicate name (another student in the same class has this name)
- `401 Unauthorized`: Invalid or missing token
- `403 Forbidden`: You don't own the class this student belongs to
- `404 Not Found`: Student not found
- `422 Unprocessable Entity`: Validation error

---

### DELETE /api/students/{student_id}
Delete a student and all their attendance records.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (204 No Content):**
No response body.

**Errors:**
- `401 Unauthorized`: Invalid or missing token
- `403 Forbidden`: You don't own the class this student belongs to
- `404 Not Found`: Student not found

**Warning:** This action cascades and deletes all attendance records for this student. This cannot be undone.

---

## Students API - Testing with cURL

### List Students
```bash
curl -X GET http://localhost:8000/api/classes/{class_id}/students \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# With search filter
curl -X GET "http://localhost:8000/api/classes/{class_id}/students?search=john&limit=10" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Filter by course credit status
curl -X GET "http://localhost:8000/api/classes/{class_id}/students?credit_status=true" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Get Students Summary
```bash
curl -X GET http://localhost:8000/api/classes/{class_id}/students/summary \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Autocomplete Student Names
```bash
curl -X GET "http://localhost:8000/api/classes/{class_id}/students/autocomplete?q=john&limit=5" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Get Student Details
```bash
curl -X GET http://localhost:8000/api/students/{student_id} \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Update Student
```bash
# Update name
curl -X PUT http://localhost:8000/api/students/{student_id} \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John M. Doe"
  }'

# Toggle course credit
curl -X PUT http://localhost:8000/api/students/{student_id} \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "course_credit_received": true
  }'
```

### Delete Student
```bash
curl -X DELETE http://localhost:8000/api/students/{student_id} \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Attendance API

### GET /api/classes/{class_id}/attendance
List attendance records for a class.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Query Parameters:**
- `skip` (optional): Number of records to skip (default: 0)
- `limit` (optional): Maximum records to return (1-500, default: 100)
- `student_name` (optional): Filter by student name (case-insensitive, partial match)
- `date_from` (optional): Filter by start date (ISO 8601 format)
- `date_to` (optional): Filter by end date (ISO 8601 format)
- `legacy` (optional): Include legacy students (default: None/false excludes them)

**Response (200 OK):**
```json
{
  "items": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "class_id": "123e4567-e89b-12d3-a456-426614174000",
      "student_id": "123e4567-e89b-12d3-a456-426614174001",
      "student_name": "John Doe",
      "timestamp": "2025-10-26T14:30:00Z",
      "created_at": "2025-10-26T14:30:05Z"
    }
  ],
  "total": 150,
  "skip": 0,
  "limit": 100
}
```

**Errors:**
- `401 Unauthorized`: Invalid or missing token
- `403 Forbidden`: You don't own this class
- `404 Not Found`: Class not found

---

### POST /api/classes/{class_id}/attendance
Log attendance for a student. Supports bulk logging (multiple records at once).

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "student_name": "john doe",
  "timestamp": "2025-10-26T14:30:00Z",
  "quantity": 1
}
```

**Fields:**
- `student_name` (required): Student's full name (case-insensitive, automatically normalized)
- `timestamp` (required): When the attendance occurred (ISO 8601 format)
- `quantity` (optional): Number of attendance records to create (1-50, default: 1)

**Name Normalization:**
Student names are automatically normalized to proper case:
- "john doe" → "John Doe"
- "MARY SMITH" → "Mary Smith"
- "jean-paul jones" → "Jean-paul Jones"

**Bulk Logging:**
When `quantity > 1`, multiple attendance records are created with the same timestamp:
- All records created in a single transaction
- Student is created/looked up only once (efficient)
- Useful for recording multiple class sessions at once

**Response (201 Created):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "class_id": "123e4567-e89b-12d3-a456-426614174000",
  "student_id": "123e4567-e89b-12d3-a456-426614174001",
  "student_name": "John Doe",
  "timestamp": "2025-10-26T14:30:00Z",
  "created_at": "2025-10-26T14:30:05Z",
  "quantity_created": 1
}
```

**Student Auto-Creation:**
If a student with the given name (case-insensitive) doesn't exist in the class, they are automatically created.

**Errors:**
- `400 Bad Request`: Class is not active (archived) OR quantity out of range (1-50)
- `401 Unauthorized`: Invalid or missing token
- `403 Forbidden`: You don't own this class
- `404 Not Found`: Class not found
- `422 Unprocessable Entity`: Validation error (empty name, invalid timestamp)

---

### DELETE /api/attendance/{attendance_id}
Delete an attendance record.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (204 No Content):**
No response body.

**Errors:**
- `401 Unauthorized`: Invalid or missing token
- `403 Forbidden`: You don't own the class
- `404 Not Found`: Attendance record not found

---

### GET /api/classes/{class_id}/attendance/summary
Get attendance summary grouped by student.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
[
  {
    "student_id": "123e4567-e89b-12d3-a456-426614174000",
    "student_name": "John Doe",
    "course_credit_received": true,
    "total_attendance": 15,
    "records": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "timestamp": "2025-10-26T14:30:00Z"
      },
      {
        "id": "123e4567-e89b-12d3-a456-426614174001",
        "timestamp": "2025-10-25T14:30:00Z"
      }
    ]
  },
  {
    "student_id": "123e4567-e89b-12d3-a456-426614174001",
    "student_name": "Jane Smith",
    "course_credit_received": false,
    "total_attendance": 12,
    "records": [...]
  }
]
```

**Features:**
- Each student appears only once (no duplicates from different capitalizations)
- Includes course credit status for each student
- Sorted by student name
- Includes all attendance records for each student

**Errors:**
- `401 Unauthorized`: Invalid or missing token
- `403 Forbidden`: You don't own this class
- `404 Not Found`: Class not found

---

## Attendance API - Testing with cURL

### List Attendance Records
```bash
# All records (excludes legacy students by default)
curl -X GET http://localhost:8000/api/classes/{class_id}/attendance \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Include legacy students (first attendance > 5 years ago)
curl -X GET "http://localhost:8000/api/classes/{class_id}/attendance?legacy=true" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# With filters
curl -X GET "http://localhost:8000/api/classes/{class_id}/attendance?student_name=john&limit=50" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Date range filter
curl -X GET "http://localhost:8000/api/classes/{class_id}/attendance?date_from=2025-10-01T00:00:00Z&date_to=2025-10-31T23:59:59Z" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Create Attendance Record
```bash
# Single attendance record
curl -X POST http://localhost:8000/api/classes/{class_id}/attendance \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "student_name": "John Doe",
    "timestamp": "2025-10-26T14:30:00Z"
  }'

# Bulk logging (create 5 records at once)
curl -X POST http://localhost:8000/api/classes/{class_id}/attendance \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "student_name": "John Doe",
    "timestamp": "2025-10-26T14:30:00Z",
    "quantity": 5
  }'
```

### Delete Attendance Record
```bash
curl -X DELETE http://localhost:8000/api/attendance/{attendance_id} \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Get Attendance Summary
```bash
curl -X GET http://localhost:8000/api/classes/{class_id}/attendance/summary \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Name Normalization & Student Management

### How It Works

When logging attendance, student names are automatically normalized and Students are created/updated:

1. **Name Capitalization**: Each word capitalized (Title Case)
   - Input: `"john doe"` → Stored: `"John Doe"`
   - Input: `"MARY SMITH"` → Stored: `"Mary Smith"`
   - Input: `"jean-paul"` → Stored: `"Jean-paul"`

2. **Whitespace**: Leading/trailing spaces removed
   - Input: `"  John Doe  "` → Stored: `"John Doe"`

3. **Case-Insensitive Uniqueness**:
   - `"john doe"` and `"John Doe"` are treated as the same student
   - Database enforces uniqueness using `LOWER(name)` index per class
   - Attempting to create duplicate students fails gracefully

4. **Auto-Creation**:
   - If student doesn't exist, they're automatically created when logging attendance
   - Student entity persists across attendance records
   - Course credit defaults to `false`, can be updated later

### Examples

```json
// These all refer to the same student:
{"student_name": "john doe"}
{"student_name": "JOHN DOE"}
{"student_name": "John Doe"}

// All create/reference one Student entity:
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "name": "John Doe",
  "course_credit_received": false
}
```

### Why This Matters

- **No Duplicates**: StudentLogs view shows each student only once
- **Consistency**: All names stored in the same format
- **Course Credit Tracking**: Can mark which students received credit
- **Autocomplete**: Quickly find existing students while typing
- **Professional**: Names always display properly

### Limitations

**Does NOT fix spelling mistakes:**
- `"John"` and `"Jon"` are different students
- `"Smith"` and `"Smyth"` are different students

**Manual correction required for:**
- Typos in names (use `PUT /api/students/{id}` to update)
- Different spellings of the same name (merge manually if needed)

---

## Active Class Enforcement

### Attendance and Class Status

The `active` field on classes controls attendance logging:

```javascript
// Class is active
{
  "active": true  // ✅ Can log attendance
}

// Class is inactive
{
  "active": false  // ❌ Cannot log attendance
}
```

### Error Response (Inactive Class)

```bash
POST /api/classes/{class_id}/attendance

# Response: 400 Bad Request
{
  "detail": "Cannot add attendance to inactive class. Please activate the class first."
}
```

### Workflow

1. **Create class** → `active: true` (default)
2. **Log attendance** → Works normally
3. **Archive class** → Set `active: false`
4. **Try to log attendance** → Error 400
5. **Reactivate class** → Set `active: true`
6. **Log attendance again** → Works normally

### Use Cases

- End of semester: Set `active: false` to prevent new entries
- Temporary hold: Deactivate during breaks
- Completed courses: Archive when finished
- Data protection: Prevent changes to finalized records

---

## Legacy Student Filter

### What is a Legacy Student?

A **legacy student** is one whose **first attendance record** in a class is more than **5 years old**.

### Default Behavior

By default, the attendance listing API **excludes legacy students** to keep the view focused on current/active students.

```bash
# Default: Excludes legacy students
GET /api/classes/{class_id}/attendance
# or explicitly
GET /api/classes/{class_id}/attendance?legacy=false
```

### Including Legacy Students

To include all students regardless of when they first attended:

```bash
GET /api/classes/{class_id}/attendance?legacy=true
```

### How It Works

1. **Calculate First Attendance**: For each student, find their oldest attendance record in the class
2. **Check Age**: If first attendance was > 5 years ago, mark as legacy
3. **Filter**: Exclude all attendance records for legacy students (unless `legacy=true`)

### Examples

**Scenario 1: Student with old records**
```
Student: John Doe
First attendance: 2018-01-15 (> 5 years ago)
Recent attendance: 2025-10-20

Result with legacy=false: ❌ None of John's records shown
Result with legacy=true: ✅ All of John's records shown
```

**Scenario 2: Student with recent records**
```
Student: Jane Smith
First attendance: 2024-09-01 (< 5 years ago)
Recent attendance: 2025-10-20

Result with legacy=false: ✅ All of Jane's records shown
Result with legacy=true: ✅ All of Jane's records shown
```

### Use Cases

**Exclude Legacy (default):**
- View current semester students
- Focus on active students
- Clean reports without old data
- Faster queries (less data)

**Include Legacy (`legacy=true`):**
- Historical analysis
- Complete attendance reports
- Alumni tracking
- Data export/backup

### API Behavior Summary

| legacy value | Behavior |
|--------------|----------|
| `null` (not provided) | Excludes legacy students |
| `false` | Excludes legacy students |
| `true` | Includes all students |

### Important Notes

- **Case-insensitive matching**: "john doe" and "John Doe" are the same student
- **Per-class calculation**: Legacy status is calculated per class
- **All or nothing**: Either all records for a student are shown, or none
- **5-year threshold**: Fixed at 5 years (1,825 days)

---

**Last Updated:** 2025-10-26
**API Version:** 1.0.0

