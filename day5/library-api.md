# Library Books REST API

This document describes a REST API for managing books in a library system.

## Endpoints

### 1. List all books

- **Method:** GET
- **Path:** `/books`
- **Description:** Returns a list of all books in the library.
- **Success status:** `200 OK`

Example response:

```json
[
  {
    "id": 1,
    "title": "Things Fall Apart",
    "author": "Chinua Achebe"
  }
]