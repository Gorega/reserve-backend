-- Migrate existing pricing data to the new pricing_options table

-- Migrate hourly pricing
INSERT INTO pricing_options (listing_id, price, unit_type, duration, is_default)
SELECT 
    id, 
    price_per_hour, 
    'hour', 
    1, 
    CASE WHEN unit_type = 'hour' THEN TRUE ELSE FALSE END
FROM listings 
WHERE price_per_hour IS NOT NULL AND price_per_hour > 0;

-- Migrate daily pricing
INSERT INTO pricing_options (listing_id, price, unit_type, duration, is_default)
SELECT 
    id, 
    price_per_day, 
    'day', 
    1, 
    CASE WHEN unit_type = 'day' THEN TRUE ELSE FALSE END
FROM listings 
WHERE price_per_day IS NOT NULL AND price_per_day > 0;

-- Migrate nightly pricing
INSERT INTO pricing_options (listing_id, price, unit_type, duration, is_default)
SELECT 
    id, 
    price_per_half_night, 
    'night', 
    1, 
    CASE WHEN unit_type = 'night' THEN TRUE ELSE FALSE END
FROM listings 
WHERE price_per_half_night IS NOT NULL AND price_per_half_night > 0;

-- Migrate pricing_details JSON data if it exists
INSERT INTO pricing_options (listing_id, price, unit_type, duration, minimum_units, is_default)
SELECT 
    id,
    JSON_EXTRACT(JSON_UNQUOTE(JSON_EXTRACT(pricing_details, CONCAT('$[', numbers.n, '].price'))), '$'),
    JSON_UNQUOTE(JSON_EXTRACT(pricing_details, CONCAT('$[', numbers.n, '].unit_type'))),
    COALESCE(JSON_EXTRACT(pricing_details, CONCAT('$[', numbers.n, '].duration')), 1),
    1,
    CASE 
        WHEN JSON_UNQUOTE(JSON_EXTRACT(pricing_details, CONCAT('$[', numbers.n, '].unit_type'))) = unit_type 
        THEN TRUE 
        ELSE FALSE 
    END
FROM 
    listings,
    (SELECT 0 as n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4) as numbers
WHERE 
    pricing_details IS NOT NULL
    AND JSON_EXTRACT(pricing_details, CONCAT('$[', numbers.n, ']')) IS NOT NULL
    AND JSON_EXTRACT(pricing_details, CONCAT('$[', numbers.n, '].price')) IS NOT NULL
ON DUPLICATE KEY UPDATE 
    price = VALUES(price),
    duration = VALUES(duration),
    is_default = VALUES(is_default);




