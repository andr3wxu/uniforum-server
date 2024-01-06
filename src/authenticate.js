import jwt from "jsonwebtoken";
import "dotenv/config"; 

const authenticateToken = (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) {
    return res.sendStatus(401)
  } else {
    jwt.verify(token.split(' ')[1], process.env.JWT_SECRET, (err, user) => {
      if (err) return res.status(403).send('Forbidden');

      req.user = user;
      next();
    })
  }
}

export default authenticateToken;