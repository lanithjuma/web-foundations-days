# SnapShare - Scaling Plan

## Assumptions

- 10,000,000 registered users.
- 10% of registered users are active daily, giving 1,000,000 daily active users (DAU).
- Each active user uploads 1 photo per day.
- Each active user views 50 feed pages per day.
- Each original photo is 2 MB.
- Each thumbnail is 50 KB (0.05 MB).
- One day is approximately 100,000 seconds for estimation.
- Peak traffic is 5 times the average traffic.
- Storage estimates exclude replication, backups, logs and other overhead.

## Estimates

### Daily active users

10,000,000 × 10% = 1,000,000 daily active users.

### Photo uploads

1,000,000 uploads/day ÷ 100,000 seconds/day ≈ 10 uploads/second.

Peak uploads = 10 × 5 = 50 uploads/second.

### Feed views

1,000,000 users × 50 feed views/day = 50,000,000 feed views/day.

50,000,000 ÷ 100,000 ≈ 500 feed views/second.

Peak feed views = 500 × 5 = 2,500 feed views/second.

### Storage

Each uploaded photo requires:

2 MB + 0.05 MB = 2.05 MB.

Daily storage:

1,000,000 × 2.05 MB = 2,050,000 MB ≈ 2.05 TB/day.

Annual storage:

2.05 TB × 365 ≈ 748 TB/year, or approximately 750 TB/year.

These estimates assume decimal units and one thumbnail per photo. Actual storage requirements will be higher when backups, replicas, additional image sizes and operational overhead are included.

## Read-heavy or write-heavy?

SnapShare is a read-heavy application. It receives approximately 50 feed views for every photo upload.

The architecture should therefore make reads inexpensive and fast. A CDN serves images, Redis caches frequently requested feeds, and database read replicas handle read-heavy metadata queries.

Uploads must remain reliable, even during traffic spikes. Background workers handle thumbnail generation so that image processing does not delay the user's upload request.

## Where Do the Photos Go?

Photo binaries should not be stored directly in relational database tables. Storing hundreds of terabytes of image data in the database would increase storage costs, backup times and operational complexity.

Instead, original photos and thumbnails are stored in object storage, such as Amazon S3. Object storage is designed for durable, scalable storage of large files.

The database stores structured metadata, including:

- Photo ID and owner ID.
- Caption and upload timestamp.
- Object storage key or URL for the original photo.
- Object storage key or URL for the thumbnail.
- Processing status, such as pending, ready or failed.

Access to private photos should be controlled through authorization checks and, where appropriate, short-lived signed URLs.

## Architecture

```text
                 Mobile App / Browser
                          |
                 HTTPS API Requests
                          |
                    Load Balancer
                          |
              +-----------+-----------+
              |           |           |
           App Server  App Server  App Server
              1           2           3
              |           |           |
              +-----------+-----------+
                          |
              +-----------+-----------+
              |           |           |
          Redis Cache  Primary DB   Job Queue
          (feed cache) (metadata)      |
                          |        Thumbnail Worker
                     Read Replicas     |
                          |             |
                     Feed Queries      |
                                        v
                                  Object Storage
                                  /            \
                           Original Photos   Thumbnails
                                  \            /
                                       |
                                       v
                                      CDN
                                       |
                                  App / Browser
```

The client uploads photo files through the application's authorized upload process. The application stores metadata in the database and sends thumbnail jobs to the queue. The worker saves generated thumbnails in object storage.

The CDN serves original photos and thumbnails to users. The application returns authorized image URLs or signed URLs as appropriate.

## Components

- **Load balancer:** Distributes incoming API requests across healthy application servers.
- **Stateless application servers:** Handle authentication, authorization, feed requests, metadata operations and upload coordination. They do not depend on local memory for persistent application data.
- **Object storage:** Stores original photos and generated thumbnails independently of the database.
- **CDN:** Caches and delivers images from locations closer to users, reducing latency and object-storage origin traffic.
- **Redis cache:** Stores frequently requested feed data to reduce database queries and speed up scrolling.
- **Primary database:** Stores authoritative user, follow relationship and photo metadata records.
- **Read replicas:** Serve suitable read-only database queries and reduce the read workload on the primary database.
- **Job queue:** Holds thumbnail-generation jobs until workers can process them and supports retries for transient failures.
- **Thumbnail workers:** Process images asynchronously, generate smaller versions and update their processing status in the database.
- **Monitoring and logging:** Track request latency, errors, queue depth, storage usage, cache hit rates and database health.

## Upload Flow

1. The user selects a photo in the mobile application or browser and submits an upload request.

2. The request reaches an application server through the load balancer.

3. The server authenticates the user and validates the file type, file size and upload permissions.

4. The application stores the original photo in object storage. For larger-scale deployments, it can issue a short-lived, authorized upload URL so the client uploads directly to object storage.

5. After the upload succeeds, the application records the photo metadata in the primary database, including the owner, caption, timestamp and object key.

6. The application adds a thumbnail-generation job to the queue.

7. The application responds with HTTP 201 Created once the photo and its metadata have been saved successfully and the job has been durably queued. The response may indicate that thumbnail processing is still pending.

8. A thumbnail worker retrieves the job, reads the original photo, creates a 50 KB thumbnail and saves it to object storage.

9. The worker updates the database record to indicate that processing is complete and records the thumbnail's object key.

10. The application updates or invalidates affected feed-cache entries so followers can discover the new photo. Cache updates and invalidation should be designed to tolerate retries and failures.

11. When followers request their feeds, the application checks Redis first. On a cache miss, it retrieves the necessary metadata from an appropriate database replica or the primary database, then refreshes the cache.

12. The client loads image files through the CDN using authorized URLs. If thumbnail processing is still pending, it can display a placeholder until the thumbnail is ready.

## Trade-offs

### 1. Speed versus freshness

Caching feeds reduces database load and improves response times. However, a newly uploaded photo may take a few seconds to appear in followers' feeds.

**Decision:** Accept short delays for ordinary feed updates, but provide cache invalidation, retry mechanisms and monitoring to prevent updates from being missed indefinitely.

### 2. Fast uploads versus immediate thumbnail availability

Generating thumbnails during the upload request increases response time and consumes application-server resources.

**Decision:** Process thumbnails asynchronously. Users receive a faster upload response, although a placeholder may appear while the thumbnail is being generated.

### 3. Storage durability versus cost

Keeping original images, thumbnails, backups and replicas increases storage consumption and cost.

**Decision:** Use object storage lifecycle policies, suitable retention rules and appropriate storage tiers. Preserve originals when required and apply backup and recovery policies based on business requirements.

### 4. Read replicas versus consistency

Read replicas may lag behind the primary database. A newly created photo might not immediately appear in a query served by a replica.

**Decision:** Use the primary database for operations requiring immediate read-after-write consistency. Allow replica reads for ordinary feed queries when a short delay is acceptable.

### 5. Cache performance versus invalidation complexity

Redis reduces repeated database queries, but cached feeds can become stale when users upload photos or change follow relationships.

**Decision:** Use explicit cache invalidation or versioning, expiration policies and reliable retry mechanisms. Monitor cache hit rates and stale-data incidents.

### 6. Scalability versus operational complexity

Queues, workers, read replicas and caching improve scalability but introduce additional services to monitor and maintain.

**Decision:** Deploy these components with health checks, metrics, alerts, retry policies and documented recovery procedures. Scale workers according to queue depth and application servers according to request load.

## Reliability and Security

- Require authenticated and authorized upload requests.
- Validate file size, type and content; do not trust the file extension alone.
- Use encryption in transit and appropriate encryption at rest.
- Restrict object-storage permissions and avoid exposing private objects through public URLs.
- Make background jobs retryable and idempotent to avoid duplicate processing.
- Monitor failed uploads, worker failures, queue depth, replica lag and database health.
- Back up metadata and test restoration procedures.
- Use rate limits and quotas to reduce abuse and protect the service during traffic spikes.

## Conclusion

SnapShare must support approximately 1 million daily active users, 10 uploads per second on average and 500 feed views per second on average, with estimated peaks of 50 uploads and 2,500 feed views per second.

The main design decision is to separate large image files from structured metadata. Object storage and a CDN handle image delivery, while the database stores metadata. Redis and read replicas reduce feed-query load, and a queue with background workers keeps uploads responsive.

This architecture provides a foundation for scaling SnapShare while balancing performance, consistency, reliability, security and cost.
