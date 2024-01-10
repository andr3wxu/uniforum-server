CREATE TABLE users (
	user_id INT PRIMARY KEY NOT NULL AUTO_INCREMENT,
    username VARCHAR(30) NOT NULL,
    email VARCHAR(100) NOT NULL,
    password_hash VARCHAR(100) NOT NULL
);

CREATE TABLE posts (
	user_id INT NOT NULL,
    post_id INT PRIMARY KEY NOT NULL AUTO_INCREMENT,
    p_title VARCHAR(200) NOT NULL,
    p_query VARCHAR(2000),
    p_time_posted TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    p_upvotes INT DEFAULT 0,
    category_id TINYINT DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE comments (
	post_id INT NOT NULL,
    comment_id INT PRIMARY KEY NOT NULL AUTO_INCREMENT,
    c_query VARCHAR(2000),
    c_time_posted TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    c_upvotes INT DEFAULT 0,
    FOREIGN KEY (post_id) REFERENCES posts(post_id)
);