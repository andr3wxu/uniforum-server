// node src/server.js
import mysql from "mysql2";
import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import "dotenv/config";
import authenticateToken from "./authenticate.js";

// migrate to mysql2-promise in future update.

const pool = mysql.createPool({
  host: process.env.HOST,
  user: process.env.USERNAME,
  password: process.env.PASSWORD,
  database: process.env.DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
});

const app = express();
app.use(cors());
app.use(express.json());



// endpoints
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const results = await new Promise((resolve, reject) => {

      pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          // email does not exist in db
          if (rows.length == 0) {
            reject(new Error("Invalid user credentials."));
            return;
          }
        }
        // user exists in db
        const user = rows[0];
        const hashed = user.password_hash;

        bcrypt.compare(password, hashed, (err, result) => {
          if (err) {
            reject(err);
          } else {
            if (result) {
              // password correct
              pool.query('SELECT user_id, username FROM users WHERE email = ? LIMIT 1', [email], (err, results) => {
                if (err) {
                  reject(err);
                } else {
                  // create token
                  const token = jwt.sign({ userId: rows[0].user_id, email: email }, process.env.JWT_SECRET, { expiresIn: '1h' });
                  resolve({token, user: results[0]});
                }
              })
            } else {
              // password incorrect
              reject(new Error("Invalid password."));
            }
          }
        });
      })
    })
    // send token and user info
    res.json(results);

  } catch (error) {
    if (error instanceof Error && error.message === "Invalid user credentials.") {
      res.status(409).send("Invalid user credentials");
    } else if (error instanceof Error && error.message === "Invalid password.") {
      res.status(403).send("Invalid password");
    } else {
      res.status(500).json({ error: 'An unexpected error occurred.' });
    }
  }
});


app.post("/api/register", async (req, res) => {
  try {
    const {email, username, password} = req.body;
    await new Promise((resolve, reject) => {

      pool.query(`SELECT * FROM users WHERE email = ? OR username = ? LIMIT 1`, [email, username], (err, rows) => {

        if (err) {
          reject(err);

        } else {
          if (rows.length != 0) {
            // user already exists in db
            reject(new Error("User with this email or username already exists."));

          } else {
            // user not in db, create password hash
            bcrypt.hash(password, 10, (err, hashed) => {
              if (err) {
                res.status(500).send("Hashing error");
                return;

              } else {
                // create new user in db
                const insert = async () => {
                  await pool.execute('INSERT INTO users VALUES (DEFAULT, ?, ?, ?, 1)', [username, email, hashed], (err, rows) => {
                    if (err) {
                      reject(err);
                    } else {
                      resolve();
                    }
                  });
                }
                insert();
              }
            })
          }
        }
      });
      // once user is inserted into db
    }).then(() => {
      return new Promise((resolve, reject) => {
        const getUser = async () => {
          await pool.execute(`SELECT user_id, username FROM users WHERE email = ? LIMIT 1`, [email], (err, rows) => {
            if (err) {
              reject(err);
            } else {
              // create token
              const token = jwt.sign({ userId: rows[0].user_id, email: email }, process.env.JWT_SECRET, { expiresIn: '1h' });
              // return token and user info
              res.json({token, user: rows[0]});
              resolve();
            }
          });
        }
        getUser();
      })
    })

  } catch (error) {
    if (error instanceof Error && error.message === "User with this email or username already exists.") {
      res.status(409).send("User with this email or username already exists");
    } else {
      console.error(error);
      res.status(500).send("An unexpected error occurred.");
    }
  }
})


app.get("/api/getPostDataByNew", authenticateToken, async (req, res) => {
  try {
    const results = await new Promise((resolve, reject) => {
      const post_data_query = `
        SELECT username, post_id, p_title, p_query, p_time_posted, p_upvotes, category_name 
        FROM test_posts p 
        LEFT JOIN users u
          ON p.user_id = u.user_id 
        LEFT JOIN categories c
          ON p.category_id = c.category_id
        ORDER BY p_time_posted DESC 
        LIMIT 20`
      pool.query(
        post_data_query,
        (err, results) => {
          if (err) {
            reject(err);
          } else {
            resolve(results);
          }
        }
      );
    });
    res.json(results);

  } catch (error) {
    res.sendStatus(500);
  }
});


app.get("/api/getCommentDataByNew/:postId", authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const results = await new Promise((resolve, reject) => {
      const comment_data_query = `
        SELECT username, comment_id, c_query, c_time_posted, c_upvotes 
        FROM comments c 
        LEFT JOIN users u
          ON c.user_id = u.user_id 
        WHERE post_id = ${postId}
        ORDER BY c_time_posted DESC 
        LIMIT 20`;
      pool.query(
        comment_data_query,
        (err, results) => {
          if (err) {
            reject(err);
          } else {
            resolve(results);
          }
        }
      );
    });
    res.json(results);

  } catch (error) {
    res.sendStatus(500);
  }
});

// deliver specific post
app.get("/api/:postId", async (req, res) => {
  try {
    console.log("post requested");
    const { postId } = req.params;
    const results = await new Promise((resolve, reject) => {
      pool.query(
        `
        SELECT username, post_id, p_title, p_query, p_time_posted, p_upvotes, category_name 
        FROM test_posts p 
        LEFT JOIN users u
          ON p.user_id = u.user_id 
        LEFT JOIN categories c
          ON p.category_id = c.category_id
        WHERE post_id = ${postId}`,
        (err, results) => {
          if (err) {
            reject(err);
          } else {
            resolve(results);
          }
        }
      );
    });
    res.send(results[0]);

  } catch (error) {
    res.sendStatus(500);
  }
});


app.put("/api/:postId/:vote", authenticateToken, async (req, res) => {
  const { postId, vote } = req.params;
  const { user_id } = req.body;
  if (vote != "upvote" && vote != "downvote") {
    // invalid vote request
    res.sendStatus(404);
  }
  try {
    await new Promise((resolve, reject) => {
      pool.query(
        // ternary operator determines whether to add or subtract from upvotes total
        `UPDATE test_posts SET p_upvotes=(p_upvotes${vote == "upvote" ? "+" : "-"}1) WHERE post_id=${postId} LIMIT 1`,
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
    await new Promise((resolve, reject) => {
      // add post to upvoted_posts table in db, allows client to remember liked posts
      const upvoteQuery = `INSERT INTO upvoted_posts VALUES (?, ?)`
      const downvoteQuery = `DELETE FROM upvoted_posts WHERE user_id = ? AND post_id = ? LIMIT 1`
      pool.query(vote == "upvote" ? upvoteQuery : downvoteQuery, [user_id, postId], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      })
    })
    await new Promise((resolve, reject) => {
      // query and return updated upvote count
      pool.query(
        `SELECT p_upvotes FROM test_posts WHERE post_id="${postId}" LIMIT 1`,
        (err, results) => {
          if (err) {
            reject(err);
          } else {
            res.json(results);
            resolve();
          }
        }
      );
    });

  } catch (error) {
    res.sendStatus(500);
  }
});


app.put("/api/upvoteComment/:commentId/:vote", authenticateToken, async (req, res) => {
  const { commentId, vote } = req.params;
  const { user_id } = req.body;
  if (vote != "upvote" && vote != "downvote") {
    // invalid vote request
    res.sendStatus(404);
  }
  try {
    await new Promise((resolve, reject) => {
      pool.query(
        // update upvote count in db corresponding to upvote or downvote
        `UPDATE comments SET c_upvotes=(c_upvotes${vote == "upvote" ? "+" : "-"}1) WHERE comment_id=${commentId} LIMIT 1`,
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
    await new Promise((resolve, reject) => {
      // insert user and comment info into upvoted_comments table
      const upvoteQuery = `INSERT INTO upvoted_comments VALUES (?, ?)`
      const downvoteQuery = `DELETE FROM upvoted_comments WHERE user_id = ? AND comment_id = ? LIMIT 1`
      pool.query(vote == "upvote" ? upvoteQuery : downvoteQuery, [parseInt(user_id), parseInt(commentId)], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve("good");
        }
      })
    })
    await new Promise((resolve, reject) => {
      // return updated upvote count
      pool.query(
        `SELECT c_upvotes FROM comments WHERE comment_id="${commentId}" LIMIT 1`,
        (err, results) => {
          if (err) {
            reject(err);
          } else {
            res.json(results);
            resolve();
          }
        }
      );
    });

  } catch (error) {
    res.sendStatus(500);
  }
});

// check if a post is upvoted
app.put('/api/isUpvote', authenticateToken, async (req, res) => {
  try {
    const { user_id, post_id } = req.body;
    await new Promise ((resolve, reject) => {
      pool.query('SELECT * FROM upvoted_posts WHERE user_id = ? and post_id = ? LIMIT 1', [user_id, post_id], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          res.json(rows)
          resolve();
        }
      })
    })

  } catch (error) {
    res.status(500);
  }
})

// check if a comment is upvoted
app.put('/api/isCommentUpvote', authenticateToken, async (req, res) => {
  const {user_id, comment_id} = req.body;
  try {
    await new Promise((resolve, reject) => {
      const query = 'SELECT * FROM upvoted_comments WHERE user_id = ? AND comment_id = ? LIMIT 1'
      pool.query(query, [user_id, comment_id], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          res.json(rows)
          resolve();
        }
      })
    })

  } catch (error) {
    res.sendStatus(500)
  }
})

// creates new post in posts table in db
app.post('/api/create', authenticateToken, async (req, res) => {
  try {
    const { user_id, p_title, p_query, category_name } = req.body;
    const results = await new Promise ((resolve, reject) => {
      // convert category id in req.body to corresponding category name in db
      const query =  `SELECT category_id FROM categories WHERE category_name = ? LIMIT 1`;
      pool.query(query, [category_name], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows[0] ? rows[0].category_id : 0);
        }
      })
    })
    await new Promise ((resolve, reject) => {
      // insert new post into posts table
      const query = `INSERT INTO test_posts VALUES (?, DEFAULT, ?, ?, DEFAULT, DEFAULT, ?)`;
      pool.query(query, [user_id, p_title, p_query, results], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      })
    })
    res.status(200).send("post created");

  } catch (error) {
    res.status(500);
  }
})

// create new comment in db
app.post('/api/comment', authenticateToken, async (req, res) => {
  const { user_id, post_id, c_query } = req.body;
  try {
    await new Promise ((resolve, reject) => {
      const query = `INSERT INTO comments VALUES (?, ?, DEFAULT, ?, DEFAULT, DEFAULT)`;
      pool.query(query, [user_id, post_id, c_query], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      })
    })
    res.status(200).send("comment created");
  } catch (error) {
    res.status(500);
  }
})

// returns post data specific to a single user
app.get("/api/myPosts/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const results = await new Promise((resolve, reject) => {
      const query = `
        SELECT username, post_id, p_title, p_query, p_time_posted, p_upvotes, category_name 
        FROM test_posts p 
        LEFT JOIN users u
          ON p.user_id = u.user_id 
        LEFT JOIN categories c
          ON p.category_id = c.category_id
        WHERE p.user_id = ?
        ORDER BY p_time_posted DESC 
        LIMIT 20`
      pool.query(query, [userId],
        (err, results) => {
          if (err) {
            reject(err);
          } else {
            resolve(results);
          }
        }
      );
    });
    res.json(results);

  } catch (error) {
    res.sendStatus(500);
  }
});

// returns email and username of the user
app.get('/api/userInfo/:userId', authenticateToken, async (req, res) => {
  try {
    const {userId} = req.params;
    await new Promise ((resolve, reject) => {
      const query = 'SELECT email, username FROM users where user_id = ? LIMIT 1'
      pool.query(query, [userId], (err, rows) => {
        if (err) {
          reject(err)
        } else {
          res.json(rows[0]);
          resolve();
        }
      })
    })

  } catch (error) {
    res.sendStatus(500);
  }
})

// updates db to reflect edits to user info from the client
app.post('/api/edit/:userId', authenticateToken, async (req, res) => {
  try {
    const {userId} = req.params;
    const {username} = req.body;
    await new Promise((resolve, reject) => {
      const check_unique_query = 'SELECT * FROM users WHERE username = ? LIMIT 1';
      pool.query(check_unique_query, [username], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          if (rows.length != 0) {
            // username already exists in db
            reject(new Error("Username already exists"));
            return;

          } else {
            // update username associated with user_id
            const update_query = 'UPDATE users SET username = ? WHERE user_id = ?';
            pool.query(update_query, [username, userId], (err, rows) => {
              if (err) {
                reject(err)
              } else {
                resolve();
              }
            })
          }
        }
      })
    })
    res.sendStatus(200);

  } catch (error) {
    if (error instanceof Error && error.message === "Username already exists") {
      res.status(409).send("Username already exists");
    } else {res.sendStatus(500);
    }
  }
})


app.listen(3000, () => {
  console.log("Listening...(3000)");
});