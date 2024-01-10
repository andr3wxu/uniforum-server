// node src/server.js
import mysql from "mysql2";
import express from "express";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import "dotenv/config";
import authenticateToken from "./authenticate.js";

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
      pool.query('SELECT * FROM users WHERE email = ?', [email], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          if (rows.length == 0) {
            reject(new Error("Invalid user credentials."));
            return;
          }
        }

        const user = rows[0];
        const hashed = user.password_hash;

        bcrypt.compare(password, hashed, (err, result) => {
          if (err) {
            reject(err);
          } else {
            if (result) {
              pool.query('SELECT user_id, username FROM users WHERE email = ?', [email], (err, results) => {
                if (err) {
                  reject(err);
                } else {
                  const token = jwt.sign({ userId: rows[0].user_id, email: email }, process.env.JWT_SECRET, { expiresIn: '1h' });
                  resolve({token, user: results[0]});
                }
              })
            } else {
              reject(new Error("Invalid password."));
            }
          }
        });
      })
    })
    res.json(results);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid user credentials.") {
      res.status(409).send("Invalid user credentials.");
    } else if (error instanceof Error && error.message === "Invalid password.") {
      res.status(403).send("Invalid password.");
    } else {
      res.status(500).json({ error: 'An unexpected error occurred.' });
    }
  }
});

app.post("/api/register", async (req, res) => {
  try {
    const {email, username, password} = req.body;
    const results = await new Promise((resolve, reject) => {
      pool.query(`SELECT * FROM users WHERE email = ? OR username = ?`, [email, username], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          if (rows.length != 0) {
            reject(new Error("User with this email or username already exists."));
          } else {
            bcrypt.hash(password, 10, (err, hashed) => {
              if (err) {
                res.status(500).send("Hashing error");
                return;
              } else {
                const insert = async () => {
                  await pool.execute('INSERT INTO users VALUES (DEFAULT, ?, ?, ?, 1)', [username, email, hashed]);
                  await pool.execute(`SELECT user_id, username, login_status FROM users WHERE email = ?`, [email], (err, rows) => {
                    if (err) {
                      reject(err);
                    } else {
                      resolve(rows);
                    }
                  });
                }
                insert();
              }
            })
          }
        }
      });
    })
    res.json(results);
  } catch (error) {
    if (error instanceof Error && error.message === "User with this email or username already exists.") {
      res.status(409).send("User with this email or username already exists.");
    } else {
      console.error(error);
      res.status(500).send("An unexpected error occurred.");
    }
  }
})

app.get("/api/getPostDataByNew", authenticateToken, async (req, res) => {
  try {
    const results = await new Promise((resolve, reject) => {
      const query = `
        SELECT username, post_id, p_title, p_query, p_time_posted, p_upvotes, category_name 
        FROM test_posts p 
        LEFT JOIN users u
          ON p.user_id = u.user_id 
        LEFT JOIN categories c
          ON p.category_id = c.category_id
        ORDER BY p_time_posted DESC 
        LIMIT 20`
      pool.query(
        query,
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
  const { postId } = req.params;
  try {
    const results = await new Promise((resolve, reject) => {
      const query = `
        SELECT username, comment_id, c_query, c_time_posted, c_upvotes 
        FROM comments c 
        LEFT JOIN users u
          ON c.user_id = u.user_id 
        WHERE post_id = ${postId}
        ORDER BY c_time_posted DESC 
        LIMIT 20`;
      pool.query(
        query,
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

app.get("/api/:postId", authenticateToken, async (req, res) => {
  const { postId } = req.params;
  try {
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

app.put("/api/:postId/:vote", async (req, res) => {
  const { postId, vote } = req.params;
  const { user_id } = req.body;
  if (vote != "upvote" && vote != "downvote") {
    res.sendStatus(404);
  }
  try {
    await new Promise((resolve, reject) => {
      pool.query(
        `UPDATE test_posts SET p_upvotes=(p_upvotes${vote == "upvote" ? "+" : "-"}1) WHERE post_id=${postId} LIMIT 1`,
        (err) => {
          if (err) {
            console.log(4);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
    console.log(1)
    await new Promise((resolve, reject) => {
      console.log(5)
      const upvoteQuery = `INSERT INTO upvoted_posts VALUES (?, ?)`
      const downvoteQuery = `DELETE FROM upvoted_posts WHERE user_id = ? AND post_id = ? LIMIT 1`
      pool.query(vote == "upvote" ? upvoteQuery : downvoteQuery, [user_id, postId], (err) => {
        if (err) {
          console.log(3);
          reject(err);
        } else {
          console.log(6)
          resolve("good");
        }
      })
    })
    await new Promise((resolve, reject) => {
      pool.query(
        `SELECT p_upvotes FROM test_posts WHERE post_id="${postId}" LIMIT 1`,
        (err, results) => {
          if (err) {
            console.log(1);
            reject(err);
          } else {
            res.json(results);
            resolve();
          }
        }
      );
    });
  } catch (error) {
    console.log("error", error);
    res.sendStatus(500);
  }
});

app.put("/api/upvoteComment/:commentId/:vote", async (req, res) => {
  const { commentId, vote } = req.params;
  const { user_id } = req.body;
  if (vote != "upvote" && vote != "downvote") {
    res.sendStatus(404);
  }
  try {
    await new Promise((resolve, reject) => {
      pool.query(
        `UPDATE comments SET c_upvotes=(c_upvotes${vote == "upvote" ? "+" : "-"}1) WHERE comment_id=${commentId} LIMIT 1`,
        (err) => {
          if (err) {
            console.log(4);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
    console.log(1)
    await new Promise((resolve, reject) => {
      console.log(5)
      const upvoteQuery = `INSERT INTO upvoted_comments VALUES (?, ?)`
      const downvoteQuery = `DELETE FROM upvoted_comments WHERE user_id = ? AND comment_id = ? LIMIT 1`
      pool.query(vote == "upvote" ? upvoteQuery : downvoteQuery, [parseInt(user_id), parseInt(commentId)], (err) => {
        if (err) {
          console.log(3);
          reject(err);
        } else {
          console.log(6)
          resolve("good");
        }
      })
    })
    await new Promise((resolve, reject) => {
      pool.query(
        `SELECT c_upvotes FROM comments WHERE comment_id="${commentId}" LIMIT 1`,
        (err, results) => {
          if (err) {
            console.log(1);
            reject(err);
          } else {
            res.json(results);
            resolve();
          }
        }
      );
    });
  } catch (error) {
    console.log("error", error);
    res.sendStatus(500);
  }
});

app.put('/api/isUpvote', async (req, res) => {
  const { user_id, post_id } = req.body;
  try {
    await new Promise ((resolve, reject) => {
      pool.query('SELECT * FROM upvoted_posts WHERE user_id = ? and post_id = ?', [user_id, post_id], (err, rows) => {
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

app.put('/api/isCommentUpvote', async (req, res) => {
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

app.post('/api/create', authenticateToken, async (req, res) => {
  const { user_id, p_title, p_query, category_name } = req.body;
  try {
    const results = await new Promise ((resolve, reject) => {
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

app.get("/api/myPosts/:userId", async (req, res) => {
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

app.get('/api/userInfo/:userId', async (req, res) => {
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

app.post('/api/edit/:userId', async (req, res) => {
  try {
    const {userId} = req.params;
    const {username} = req.body;
    console.log(username);
    await new Promise((resolve, reject) => {
      const query1 = 'SELECT * FROM users WHERE username = ? LIMIT 1';
      pool.query(query1, [username], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          if (rows.length != 0) {
            reject(new Error("Username already exists"));
            return;
          } else {
            const query2 = 'UPDATE users SET username = ? WHERE user_id = ?';
            pool.query(query2, [username, userId], (err, rows) => {
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