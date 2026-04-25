const userModel = require("../models/user.model")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")

const isProduction = process.env.NODE_ENV === "production"

const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
}

async function registerUser(req, res) {
  const { fullName: { firstName, lastName }, email, password } = req.body

  const userExists = await userModel.findOne({ email })
  if (userExists) {
    return res.status(400).json({ message: "User already exists" })
  }

  const hashPassword = await bcrypt.hash(password, 10)
  const user = await userModel.create({
    fullName: { firstName, lastName },
    email,
    password: hashPassword,
  })

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" })
  res.cookie("token", token, cookieOptions)

  return res.status(201).json({
    message: "User created successfully",
    user: { _id: user._id, email: user.email, fullName: user.fullName },
  })
}

async function loginUser(req, res) {
  const { email, password } = req.body

  const user = await userModel.findOne({ email })
  if (!user) return res.status(400).json({ message: "Invalid email or password" })

  const passwordValid = await bcrypt.compare(password, user.password)
  if (!passwordValid) return res.status(400).json({ message: "Invalid email or password" })

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" })
  res.cookie("token", token, cookieOptions)

  return res.status(200).json({
    message: "User logged in successfully",
    user: { _id: user._id, email: user.email, fullName: user.fullName },
  })
}

async function logoutUser(req, res) {
  res.clearCookie("token", {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
  })
  return res.status(200).json({ message: "Logged out successfully" })
}

module.exports = { registerUser, loginUser, logoutUser }