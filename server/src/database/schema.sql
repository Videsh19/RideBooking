-- ==============================================================================
-- GoRide Relational Database Schema — Role-Based Architecture & Ride Management
-- Derived from Approved UML Class Diagram and SRS Specifications
-- ==============================================================================

-- 1. Users Table (Maps to UML Class: User)
CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone_no VARCHAR(20) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('RIDER', 'DRIVER', 'ADMIN') NOT NULL DEFAULT 'RIDER',
    token_version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Driver Profiles Table (Maps to UML Class: Driver)
CREATE TABLE IF NOT EXISTS driver_profiles (
    driver_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    license_no VARCHAR(50) NOT NULL,
    vehicle_no VARCHAR(50) NOT NULL,
    vehicle_model VARCHAR(100) NOT NULL,
    vehicle_category ENUM('STANDARD', 'COMFORT', 'XL') NULL,
    vehicle_color VARCHAR(50) DEFAULT 'White',
    passenger_capacity INT NOT NULL DEFAULT 4,
    vehicle_approval_status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'APPROVED',
    is_vehicle_active BOOLEAN NOT NULL DEFAULT TRUE,
    license_doc_path VARCHAR(255) NULL,
    vehicle_doc_path VARCHAR(255) NULL,
    current_latitude DECIMAL(10, 7) NULL,
    current_longitude DECIMAL(10, 7) NULL,
    location_updated_at TIMESTAMP NULL,
    location_fix_timestamp_ms BIGINT UNSIGNED NULL,
    rating DECIMAL(3, 2) DEFAULT 5.00,
    is_available BOOLEAN DEFAULT FALSE,
    approval_status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_driver_approval (approval_status),
    INDEX idx_driver_vehicle_category (vehicle_category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Locations Table (Maps to UML Class: Location)
CREATE TABLE IF NOT EXISTS locations (
    location_id INT AUTO_INCREMENT PRIMARY KEY,
    address VARCHAR(255) NOT NULL,
    service_zone VARCHAR(50) NOT NULL,
    latitude DECIMAL(10, 7) NULL,
    longitude DECIMAL(10, 7) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Routes Table (Maps to UML Class: Route)
CREATE TABLE IF NOT EXISTS routes (
    route_id INT AUTO_INCREMENT PRIMARY KEY,
    pickup_location_id INT NOT NULL,
    dest_location_id INT NOT NULL,
    distance_km DECIMAL(8, 2) NOT NULL,
    estimated_duration_min INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (pickup_location_id) REFERENCES locations(location_id) ON DELETE CASCADE,
    FOREIGN KEY (dest_location_id) REFERENCES locations(location_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Bookings Table (Maps to UML Class: Booking & BookingStatus Enum)
CREATE TABLE IF NOT EXISTS bookings (
    booking_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    driver_id INT NULL,
    route_id INT NULL,
    pickup_address VARCHAR(255) NOT NULL,
    dest_address VARCHAR(255) NOT NULL,
    pickup_zone VARCHAR(50) NOT NULL,
    dest_zone VARCHAR(50) NOT NULL,
    vehicle_tier ENUM('STANDARD', 'COMFORT', 'XL') NOT NULL DEFAULT 'STANDARD',
    status ENUM('REQUESTED', 'CONFIRMED', 'ONGOING', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'REQUESTED',
    payment_status ENUM('UNPAID', 'PAID') NOT NULL DEFAULT 'UNPAID',
    total_fare DECIMAL(10, 2) NOT NULL,
    base_fare DECIMAL(10, 2) NULL,
    rate_per_km DECIMAL(10, 2) NULL,
    cancellation_reason VARCHAR(255) NULL,
    cancellation_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    cancelled_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    booking_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (driver_id) REFERENCES driver_profiles(driver_id) ON DELETE SET NULL,
    FOREIGN KEY (route_id) REFERENCES routes(route_id) ON DELETE SET NULL,
    INDEX idx_user_bookings (user_id, booking_date),
    INDEX idx_booking_driver (driver_id),
    INDEX idx_status (status),
    INDEX idx_bookings_vehicle_tier (vehicle_tier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Driver Booking Rejections Table (Tracks individual driver declines without cancelling rider request)
CREATE TABLE IF NOT EXISTS driver_booking_rejections (
    rejection_id INT AUTO_INCREMENT PRIMARY KEY,
    driver_id INT NOT NULL,
    booking_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_driver_booking_rej (driver_id, booking_id),
    FOREIGN KEY (driver_id) REFERENCES driver_profiles(driver_id) ON DELETE CASCADE,
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Payments Table (Maps to UML Class: Payment & paymentStatus/PaymentMethod Enums)
CREATE TABLE IF NOT EXISTS payments (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    user_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method ENUM('Cash', 'Card', 'UPI', 'Wallet', 'NetBanking') NOT NULL,
    payment_status ENUM('PENDING', 'SUCCESS', 'FAILED', 'REFUND') NOT NULL DEFAULT 'PENDING',
    transaction_id VARCHAR(100) NOT NULL UNIQUE,
    successful_booking_id INT GENERATED ALWAYS AS (IF(payment_status = 'SUCCESS', booking_id, NULL)) STORED,
    refund_reason VARCHAR(255) NULL,
    refunded_at TIMESTAMP NULL,
    refund_transaction_id VARCHAR(100) NULL,
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_successful_payment (successful_booking_id),
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_payment_booking (booking_id),
    INDEX idx_payment_user (user_id),
    INDEX idx_payment_status (payment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Ratings Table (Post-Trip Star Ratings & Written Reviews)
CREATE TABLE IF NOT EXISTS ratings (
    rating_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL UNIQUE,
    user_id INT NOT NULL,
    driver_id INT NOT NULL,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comments VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (driver_id) REFERENCES driver_profiles(driver_id) ON DELETE CASCADE,
    INDEX idx_rating_driver (driver_id),
    INDEX idx_rating_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Password Resets Table (Secure Single-Use Expiring Password Reset Tokens)
CREATE TABLE IF NOT EXISTS password_resets (
    reset_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_token_hash (token_hash),
    INDEX idx_user_resets (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Dispatch Failures Table (Logs failed, timed out, or unassigned dispatch attempts)
CREATE TABLE IF NOT EXISTS dispatch_failures (
    failure_id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    reason VARCHAR(255) NOT NULL,
    failed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE CASCADE,
    INDEX idx_dispatch_failure_booking (booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
