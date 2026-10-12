# SnapShare Photo-App Scaling Plan

## 1. Assumptions and workload estimates

### Assumptions

- SnapShare has **10,000,000 registered users**.
- **10%** of registered users are active on a typical day.
- Each daily active user uploads **1 photo per day** and views **50 feed pages per day**.
- Each original photo averages **2 MB**; each photo also has one **50 KB thumbnail**.
- Use **1 day ≈ 100,000 seconds** for request-rate estimates, as specified in the assignment.
- Use **365 days per year** and decimal storage units (1 TB = 1,000,000 MB; 1 GB = 1,000 MB).
- Storage estimates count one copy of every original and thumbnail. They exclude replication, backups, metadata, logs, temporary files, and storage-system overhead.
- Peak feed traffic is estimated at **5× the average**. The same peak multiplier is not assumed for uploads because the assignment only requests peak feed views.

### Daily active users

Daily active users (DAU) = registered users × daily active percentage

= 10,000,000 × 10% = **1,000,000 daily active users**

### Upload rate

- Uploads per day = 1,000,000 users × 1 photo = **1,000,000 uploads/day**
- Average uploads per second = 1,000,000 ÷ 100,000 = **about 10 uploads/second**

### Feed-view rate

- Feed views per day = 1,000,000 users × 50 pages = **50,000,000 feed views/day**
- Average feed views per second = 50,000,000 ÷ 100,000 = **about 500 views/second**
- Peak feed views per second = 500 × 5 = **about 2,500 views/second**

These are planning estimates, not guarantees; real traffic will vary by time of day and user behaviour.

### Photo storage per year

**Original photos**
- Per day = 1,000,000 × 2 MB = **2,000,000 MB/day = 2 TB/day**
- Per year = 2 TB × 365 = **730 TB/year**

**Thumbnails**
- Per day = 1,000,000 × 50 KB = **50,000,000 KB/day = 50 GB/day**
- Per year = 50 GB × 365 = **18.25 TB/year**

**Total new image storage**
- Per year = 730 TB + 18.25 TB = **748.25 TB/year** (about 0.75 PB/year), before replication, backups, and overhead.

## 2. Read-heavy or write-heavy?

SnapShare is **read-heavy** by operation count: it receives about 50 million feed views per day compared with 1 million photo uploads per day, or roughly 50 feed views for each upload. This means the design should optimise feed delivery with a CDN and cache, use a database read replica for read queries, and keep app servers horizontally scalable; uploads still need reliable durable storage and background processing.

## 3. Why photos should not be stored inside the database

Photo files are large binary objects, so storing them directly in the main database would make the database grow quickly, increase backup and restore times, and consume resources needed for feed and metadata queries. Store original photos and generated thumbnails in **object storage** instead, and keep only their object keys/URLs and related metadata (such as owner, timestamp, dimensions, and access permissions) in the database. Object storage is built to hold large files durably and can work with a CDN to deliver images efficiently.

## 4. Text architecture diagram

```text
                         READ / IMAGE DELIVERY
                    +-----------------------------+
                    |             CDN             |
                    | cached thumbnails/photos    |
                    +--------------+--------------+
                                   |
Browser / Mobile App --------------+-------------------------------+
          |                                                        |
          | API requests                                           | cache miss /
          v                                                        | image fetch
   +------------------+                                            v
   |  Load Balancer   |                                  +-------------------+
   +--------+---------+                                  |   Object Storage  |
            |                                            | originals +       |
            v                                            | thumbnails        |
   +--------------------------+                           +-------------------+
   | App Servers (stateless)  |                                      ^
   +----+----------+----------+                                      |
        |          |                                                 |
        |          +----------------------+                          |
        v                                 v                          |
   +-----------+                  +---------------+                  |
   |   Cache   |                  | Primary DB    |                  |
   | feed/data |                  | metadata      |                  |
   +-----------+                  +-------+-------+                  |
                                          | replication              |
                                          v                          |
                                  +----------------+                 |
                                  | DB Read Replica|                 |
                                  | feed/read query|                 |
                                  +----------------+                 |
                                                                     |
 Upload request -> App Servers -> Object Storage (original)          |
                         |                                           |
                         v                                           |
                    +-----------+      consume job      +-----------+
                    |   Queue   | --------------------> |  Worker   |
                    | thumbnail |                       | creates   |
                    | jobs      |                       | thumbnail |
                    +-----------+                       +-----+-----+
                                                              |
                                                              v
                                                   Object Storage
                                                   (thumbnail file)
```

## 5. What each component does

- **CDN:** Caches and serves frequently requested photos and thumbnails close to users, reducing latency and origin traffic.
- **Load balancer:** Distributes incoming API requests across healthy app servers so that no single server handles all traffic.
- **Stateless app servers:** Authenticate users, validate requests, apply permissions, coordinate storage and database operations, and can be scaled horizontally.
- **Cache:** Holds frequently accessed feed data and metadata to reduce repeated database reads and speed up feed requests.
- **Primary database:** Stores structured metadata such as users, photo ownership, captions, timestamps, follow relationships, and object-storage keys.
- **Database read replica:** Serves eligible read queries to reduce read pressure on the primary database, while replication delay may mean some new changes are not immediately visible.
- **Object storage:** Stores the original photo files and thumbnail files durably without putting large binary files in the relational database.
- **Queue:** Holds thumbnail-generation jobs so uploads can complete without waiting for image processing and jobs can be retried if needed.
- **Thumbnail worker:** Consumes queued jobs, creates a smaller thumbnail from the original, and writes the thumbnail to object storage.

## 6. Step-by-step photo upload flow

1. The user selects a photo in the app and submits it with any caption or other metadata.
2. The request reaches the load balancer, which routes it to a healthy app server.
3. The app server authenticates the user, checks upload permissions and validates the file type and size.
4. The original photo is uploaded to object storage; the storage key is returned or recorded.
5. The app server writes the photo's metadata and object-storage key to the primary database.
6. The app server places a thumbnail-generation job on the queue, including the original object's key and the destination details.
7. The app returns an upload success response once the original and required metadata are safely recorded; thumbnail processing can finish asynchronously.
8. A thumbnail worker consumes the job, reads the original from object storage, generates a 50 KB target thumbnail (or a suitably sized compressed thumbnail), and saves it in object storage.
9. The worker updates the photo metadata with the thumbnail key or processing status. Failed jobs are retried and eventually flagged for investigation if retries are exhausted.
10. When followers request their feed, app servers obtain feed metadata from cache or the read replica, and image URLs are delivered through the CDN; a CDN cache miss is served from object storage.

## 7. Trade-offs

1. **Cache speed vs. freshness:** Caching makes feeds faster and reduces database load, but cached feeds can be briefly stale. Use expiration rules and invalidate or update relevant cache entries when important data changes.
2. **Asynchronous thumbnails vs. immediate completeness:** A queue keeps uploads responsive and lets workers scale independently, but a newly uploaded photo may appear before its thumbnail is ready. Show a placeholder or the original temporarily, and retry failed jobs.
3. **Read replica scalability vs. consistency:** A read replica increases read capacity, but replication lag can cause a recent upload or edit to be missing briefly from feed queries. Send consistency-sensitive reads to the primary or handle short-lived lag in the application.
4. **CDN performance vs. invalidation and access control:** CDN caching reduces latency and object-storage traffic, but changing or removing a photo may require cache invalidation or versioned URLs. Private photos need appropriately authorised delivery, such as short-lived signed URLs, rather than unrestricted public links.
5. **Object storage durability vs. extra coordination:** Object storage is a good fit for large files, but storing the object and its database metadata is not one atomic transaction. The application needs cleanup/retry logic for partial failures and orphaned objects.

## 8. Summary

- **Daily active users:** 1,000,000
- **Average uploads:** about 10/second
- **Average feed views:** about 500/second
- **Peak feed views (5×):** about 2,500/second
- **New image storage per year:** 730 TB of originals + 18.25 TB of thumbnails = **748.25 TB/year** before replication, backups, and overhead
- **Workload:** Read-heavy, so optimise feed reads and image delivery using caching, a CDN, read replicas, and horizontally scalable app servers.
