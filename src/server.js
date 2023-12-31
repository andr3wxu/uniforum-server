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
app.get('/getdata', async (req, res) => {
  pool.query("SELECT product_key, price, description FROM products", (err, rows) => {
    res.send(rows);
    console.log(rows);
  })
});

app.get('/:name', async (req, res) => {
  const {name} = req.params;
  pool.query(`SELECT product_key, price, description FROM products WHERE product_key="${name}"`, (err, rows) => {
    res.json(rows);
  })
})

app.listen(3000, () => {
  console.log("Listening...(3000)")
});