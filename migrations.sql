BEGIN;

DO $$ BEGIN
    CREATE TYPE media_type_enum AS ENUM ('IMAGE', 'VIDEO', 'YOUTUBE');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS admin (
    adminid SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    passwordhashed TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'admin',
    isactive BOOLEAN NOT NULL DEFAULT TRUE,
    createdat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media (
    mediaid SERIAL PRIMARY KEY,
    mimetype VARCHAR(100) NOT NULL,
    filedata BYTEA NOT NULL,
    uploadedby INT REFERENCES admin(adminid) ON DELETE SET NULL,
    createdat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS post (
    postid SERIAL PRIMARY KEY,
    adminid INT NOT NULL REFERENCES admin(adminid),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    publisheddate DATE NOT NULL DEFAULT CURRENT_DATE,
    mediatype media_type_enum NOT NULL,
    mediaid INT REFERENCES media(mediaid) ON DELETE SET NULL,
    mediaurl TEXT,
    hasreadmore BOOLEAN NOT NULL DEFAULT FALSE,
    slug VARCHAR(160) NOT NULL UNIQUE,
    isdeleted BOOLEAN NOT NULL DEFAULT FALSE,
    createdat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (
        (mediatype IN ('IMAGE', 'VIDEO') AND mediaid IS NOT NULL AND mediaurl IS NULL)
        OR
        (mediatype = 'YOUTUBE' AND mediaid IS NULL AND mediaurl IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS readmore (
    readmoreid SERIAL PRIMARY KEY,
    postid INT NOT NULL UNIQUE REFERENCES post(postid) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    createdat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS readmore_media (
    readmoremediaid SERIAL PRIMARY KEY,
    readmoreid INT NOT NULL REFERENCES readmore(readmoreid) ON DELETE CASCADE,
    position SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 6),
    mediatype media_type_enum NOT NULL,
    mediaid INT REFERENCES media(mediaid) ON DELETE SET NULL,
    mediaurl TEXT,
    createdat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (readmoreid, position),
    CHECK (
        (mediatype IN ('IMAGE', 'VIDEO') AND mediaid IS NOT NULL AND mediaurl IS NULL)
        OR
        (mediatype = 'YOUTUBE' AND mediaid IS NULL AND mediaurl IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS refresh_token (
    refreshtokenid SERIAL PRIMARY KEY,
    adminid INT NOT NULL REFERENCES admin(adminid) ON DELETE CASCADE,
    tokenhash VARCHAR(128) NOT NULL UNIQUE,
    expiresat TIMESTAMP NOT NULL,
    revokedat TIMESTAMP,
    replacedbytokenhash VARCHAR(128),
    lastusedat TIMESTAMP,
    createdat TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_post_slug ON post(slug);
CREATE INDEX IF NOT EXISTS idx_post_adminid ON post(adminid);
CREATE INDEX IF NOT EXISTS idx_post_isdeleted ON post(isdeleted);
CREATE INDEX IF NOT EXISTS idx_post_isdeleted_publisheddate ON post(isdeleted, publisheddate DESC);
CREATE INDEX IF NOT EXISTS idx_readmore_postid ON readmore(postid);
CREATE INDEX IF NOT EXISTS idx_readmore_media_readmoreid ON readmore_media(readmoreid);
CREATE INDEX IF NOT EXISTS idx_refresh_token_adminid ON refresh_token(adminid);
CREATE INDEX IF NOT EXISTS idx_refresh_token_hash ON refresh_token(tokenhash);

COMMIT;
