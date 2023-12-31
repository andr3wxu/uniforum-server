// node src/server.js
import mysql from "mysql2";
import express from "express";
import 'dotenv/config';

const pool = mysql.createPool({
  host: process.env.HOST,
  user: process.env.USERNAME,
  password: process.env.PASSWORD,
  database: process.env.DATABASE,
  waitForConnections: true,
  connectionLimit: 10
})

const app = express();
app.use(express.json());

// endpoints
app.get('/api/getPostDataByNew/:limit', async (req, res) => {
  const {limit} = req.params;
  pool.query(`SELECT * FROM test_posts ORDER BY p_time_posted DESC LIMIT ${limit}`, (err, results) => {
    if (err) {
      res.status(500);
    } else {
      res.json(results);
    }
  });
})

app.get('/api/:postId', async (req, res) => {
  const {postId} = req.params;
  pool.query(`SELECT * FROM test_posts WHERE post_id="${postId}"`, (err, rows) => {
    if (err) {
      res.status(500);
    } else {
      if (rows.length != 0) {
        res.json(rows);
      } else {
        res.sendStatus(404);
      }
    }
  });
})

app.listen(3000, () => {
  console.log("Listening...(3000)")
});