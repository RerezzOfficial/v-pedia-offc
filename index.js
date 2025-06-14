require("dotenv").config();
const express = require("express");
const session = require("express-session");
const nodemailer = require("nodemailer");
const MongoStore = require("connect-mongo");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const qrcode = require("qrcode");
const fs = require("fs");
const FormData = require("form-data");
const axios = require("axios");
const path = require("path");
const app = express();
const footer = 'V-Pedia'
const ATLAN_API_KEY = process.env.ATLAN_API_KEY;
const BASE_URL = "https://atlantich2h.com";

const API_KEY = process.env.SEKALIPAY_KEY;
const BASE_URL2 = "https://sekalipay.com/api/v1";

const domain = process.env.PTERO_DOMAIN;
const apikey = process.env.PTERO_API_KEY;

mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/appdb");
const db = mongoose.connection;

const userSchema = new mongoose.Schema({
  fullname: String,
  username: { type: String, unique: true },
  nomor: String,
  email: { type: String, unique: true },
  password: String,
  profileUrl: String,
  saldo: Number,
  coin: Number,
  apiKey: String,
  tanggalDaftar: Date,
  role: { type: String, default: "user" },
  isVerified: Boolean,
  lastLogin: Date,
  referralCode: String,
  otpCode: String,
  otpCodeExpired: Date,
  aktifitas: String,
  whitelistIp: {
    type: [String],
    default: ["0.0.0.0"],
  },
  history: [
    {
      aktivitas: String,
      nominal: Number,
      status: String,
      code: String,
      notes: String,
      tanggal: Date,
    },
  ],
});

const User = mongoose.model("User", userSchema);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      ttl: 160 * 60,
    }),
    cookie: {
      maxAge: 1000 * 60 * 120,
    },
  })
);

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect("/auth/login");
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId || req.session.role !== "admin") {
    return res.redirect("/auth/login");
  }
  next();
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.get("/auth/forgot-password", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "forgot.html"));
});


app.get("/auth/register", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "register.html"));
});

app.post("/auth/register", async (req, res) => {
  try {
    const existingUser = await User.findOne({ username: req.body.username });
    if (existingUser) {
      return res.status(400).json({ error: "Username already exists" });
    }
    const existingEmail = await User.findOne({ email: req.body.email });
    if (existingEmail) {
      return res.status(400).json({ error: "Email already exists" });
    }
    const existingNomor = await User.findOne({ nomor: req.body.nomor });
    if (existingNomor) {
      return res.status(400).json({ error: "Nomor telepon already exists" });
    }
    let apiKey = generateApiKey();
    let apiKeyExists = await User.findOne({ apiKey });
    while (apiKeyExists) {
      apiKey = generateApiKey();
      apiKeyExists = await User.findOne({ apiKey });
    }
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const newUser = new User({
      fullname: req.body.fullname,
      username: req.body.username,
      nomor: req.body.nomor,
      email: req.body.email,
      password: hashedPassword,
      profileUrl:
        req.body.profileUrl ||
        "https://i.pinimg.com/236x/a2/80/e2/a280e2a50bf6240f29b49a72875adee5.jpg",
      saldo: 0,
      coin: 0,
      apiKey: apiKey,
      tanggalDaftar: new Date(),
      role: "user",
      isVerified: false,
      lastLogin: new Date(),
      referralCode: generateReferralCode(req.body.username),
      history: [],
    });
    await newUser.save();
    res.redirect("/auth/login");
  } catch (error) {
    res
      .status(400)
      .json({ error: "Registration failed", message: error.message });
  }
});

app.get("/auth/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.post("/auth/login", async (req, res) => {
  try {
    const user = await User.findOne({
      $or: [
        { username: req.body.usernameOrEmail },
        { email: req.body.usernameOrEmail },
      ],
    });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found",
      });
    }
    const validPassword = await bcrypt.compare(
      req.body.password,
      user.password
    );
    if (!validPassword) {
      return res.status(400).json({
        success: false,
        message: "Invalid password",
      });
    }
    req.session.userId = user._id;
    req.session.role = user.role;
    user.lastLogin = new Date();
    await user.save();
    return res.status(200).json({
      success: true,
      message: "Login successful",
      role: user.role,
      redirectUrl: user.role === "admin" ? "/admin" : "/dashboard",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.get("/dashboard", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/transfer", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "transfer.html"));
});

app.get("/profile", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "profile.html"));
});

app.get("/deposit", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "deposit.html"));
});

app.get("/price-list", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "price-list.html"));
});

app.get("/mutation", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "mutation.html"));
});

app.get("/api-key-page", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "api-key-page.html"));
});

app.get("/topup", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "topup.html"));
});

app.get("/buy-panel", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "panel.html"));
});

app.get("/docs", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "docs.html"));
});

app.get("/admin", requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/auth/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/auth/login");
});

function generateApiKey() {
  const randomPart =
    Math.random().toString(36).substring(2, 10) +
    Math.random().toString(36).substring(2, 10);
  return `VPedia-${randomPart}`;
}

function generateReferralCode(username) {
  return username.toUpperCase() + Math.floor(1000 + Math.random() * 9000);
}

app.get("/profile/users", requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    return res.status(200).json({
      success: true,
      user: {
        fullname: user.fullname,
        username: user.username,
        nomor: user.nomor,
        email: user.email,
        profileUrl: user.profileUrl,
        saldo: user.saldo,
        coin: user.coin,
        apiKey: user.apiKey,
        tanggalDaftar: user.tanggalDaftar,
        role: user.role,
        isVerified: user.isVerified,
        lastLogin: user.lastLogin,
        referralCode: user.referralCode,
        history: user.history,
        whitelistIp: user.whitelistIp,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

const uploadMemory = multer({ storage: multer.memoryStorage() }); 

async function CatBox(buffer, originalname) {
  const data = new FormData();
  data.append("reqtype", "fileupload");
  data.append("userhash", "");
  data.append("fileToUpload", buffer, { filename: originalname });
  const config = {
    method: "POST",
    url: "https://catbox.moe/user/api.php",
    headers: {
      ...data.getHeaders(),
      "User-Agent":
        "Mozilla/5.0 (Android 10; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0",
    },
    data: data,
  };
  const api = await axios.request(config);
  return api.data;
}

app.post("/profile/update-photo",requireLogin, uploadMemory.single("photo"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res
          .status(400)
          .json({ success: false, message: "No file uploaded" });
      }
      const uploadedUrl = await CatBox(file.buffer, file.originalname);
      await User.findByIdAndUpdate(req.session.userId, {
        profileUrl: uploadedUrl,
      });
      return res.status(200).json({
        success: true,
        message: "Profile photo updated successfully",
        profileUrl: uploadedUrl,
      });
    } catch (error) {
      console.error("Error update profile photo:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to update profile photo",
      });
    }
  }
);

app.post("/get/forgot-password", async (req, res) => {
  const { nomor } = req.body;
  if (!nomor) {
    return res.status(400).json({ success: false, message: "Nomor telepon harus diisi" });
  }
  try {
    const normalizedNomor = nomor.startsWith("62") ? nomor : "62" + nomor.substring(1);
    const user = await User.findOne({ nomor: normalizedNomor });
    if (!user) {
      return res.status(404).json({ success: false, message: "User tidak ditemukan awali nomor dengan 62" });
    }
    const now = new Date();
    if (user.otpCodeExpired && user.otpCodeExpired <= new Date(now - 5 * 60 * 1000)) {
      await User.updateOne(
        { nomor: normalizedNomor },
        { $set: { otpCode: null, otpCodeExpired: null } }
      );
    }
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // OTP berlaku 5 menit
    await User.findOneAndUpdate(
      { nomor: normalizedNomor },
      {
        otpCode,
        otpCodeExpired: otpExpiry,
        aktifitas: 'Rest Password',
      },
      { new: true, upsert: false }
    );
    return res.json({ success: true, message: "OTP berhasil dikirim", otp: otpCode });
  } catch (error) {
    console.error("Error generate OTP:", error);
    return res.status(500).json({ success: false, message: "Gagal generate OTP" });
  }
});

app.post("/auth/reset-password", async (req, res) => {
  const { nomor, otp, newPassword } = req.body;
  if (!nomor || !otp || !newPassword) {
    return res.status(400).json({ success: false, message: "Semua field harus diisi" });
  }
  try {
    const user = await User.findOne({ nomor });
    if (!user) {
      return res.status(400).json({ success: false, message: "User tidak ditemukan" });
    }
    if (user.otpCode !== otp) {
      return res.status(400).json({ success: false, message: "OTP tidak cocok" });
    }
    if (!user.otpCodeExpired || user.otpCodeExpired < new Date()) {
      return res.status(400).json({ success: false, message: "OTP sudah kadaluarsa" });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.otpCode = null;
    user.otpCodeExpired = null;
    await user.save();
    res.json({ success: true, message: "Password berhasil direset" });
  } catch (error) {
    console.error("Error reset password:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/api/user-otp-info", async (req, res) => {
  const validApiKey = 'RAHASIA_REZZZ_123'; 
  const providedKey = req.query.apikey;

  if (!providedKey || providedKey !== validApiKey) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized. Invalid API key.",
    });
  }

  try {
    const users = await User.find(
      { nomor: { $ne: null } },
      'nomor otpCode otpCodeExpired fullname username aktifitas'
    );
    const now = new Date();

    const result = users
      .map((user) => {
        let diffMinutes = 0;
        if (user.otpCodeExpired) {
          const diffMs = new Date(user.otpCodeExpired) - now;
          diffMinutes = diffMs > 0 ? Math.ceil(diffMs / 60000) : 0;
        }
        return {
          nomor: user.nomor,
          fullname: user.fullname,
          username: user.username,
          otpCode: user.otpCode,
          waktuSisaMenit: diffMinutes,
          aktifitas: user.aktifitas || null,
        };
      })
      .filter((user) => user.otpCode && user.aktifitas); // Filter hanya data dengan otpCode dan aktifitas tidak null

    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Error fetching OTP info:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching data",
    });
  }
});


app.post("/profile/request-email-change", requireLogin, async (req, res) => {
  const { newEmail } = req.body;
  
  if (!newEmail) {
    return res
      .status(400)
      .json({ success: false, message: "New email is required" });
  }
  
  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  
  if (newEmail === user.email) {
    return res.status(400).json({
      success: false,
      message: "New email cannot be the same as current email",
    });
  }
  
  const emailUsed = await User.findOne({ email: newEmail });
  if (emailUsed) {
    return res
      .status(400)
      .json({ success: false, message: "Email already in use" });
  }
  
  try {
    user.email = newEmail;
    await user.save();

    return res.json({
      success: true,
      message: "Email updated successfully",
      newEmail: user.email,
    });
  } catch (err) {
    console.error("Gagal mengupdate email:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/profile/change-fullname", requireLogin, async (req, res) => {
  const { newFullname } = req.body;

  if (!newFullname) {
    return res
      .status(400)
      .json({ success: false, message: "New fullname is required" });
  }
  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  try {
    user.fullname = newFullname; 
    await user.save();
    return res.status(200).json({
      success: true,
      message: "Fullname has been successfully changed",
      newFullname: user.fullname,
    });
  } catch (err) {
    console.error("Error changing fullname:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

app.post("/profile/change-username", requireLogin, async (req, res) => {
  const { newUsername } = req.body;
  if (!newUsername) {
    return res
      .status(400)
      .json({ success: false, message: "New username is required" });
  }
  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  const existingUsername = await User.findOne({ username: newUsername });
  if (existingUsername) {
    return res
      .status(400)
      .json({ success: false, message: "Username already exists" });
  }
  try {
    user.username = newUsername;
    await user.save();
    return res.status(200).json({
      success: true,
      message: "Username has been successfully changed",
      newUsername: user.username,
    });
  } catch (err) {
    console.error("Error changing username:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

app.post("/get/otp-change-nomor", requireLogin, async (req, res) => {
  const { nomorLama } = req.body;
  if (!nomorLama) {
    return res.status(400).json({ success: false, message: "Nomor lama harus diisi" });
  }
  try {
    const user = await User.findOne({ nomor: nomorLama });
    if (!user) {
      return res.status(404).json({ success: false, message: "User tidak ditemukan" });
    }
    const now = new Date();
    if (user.otpCodeExpired && user.otpCodeExpired > now) {
    } else {
      await User.updateOne({ nomor: nomorLama }, { $set: { otpCode: null, otpCodeExpired: null } });
    }
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 menit
    await User.findOneAndUpdate(
      { nomor: nomorLama },
      {
        otpCode,
        otpCodeExpired: otpExpiry,
        aktifitas: 'Change Number',
      }
    );
    return res.json({
      success: true,
      message: "OTP berhasil dibuat, gunakan untuk konfirmasi",
      otp: otpCode, 
    });
  } catch (err) {
    console.error("Error generate OTP:", err);
    return res.status(500).json({ success: false, message: "Gagal generate OTP" });
  }
});

app.post("/auth/change-number", requireLogin, async (req, res) => {
  const { nomorLama, otp, nomorBaru } = req.body;
  if (!nomorLama || !otp || !nomorBaru) {
    return res.status(400).json({ success: false, message: "Semua field harus diisi" });
  }
  try {
    const user = await User.findOne({ nomor: nomorLama });
    if (!user) {
      return res.status(404).json({ success: false, message: "User tidak ditemukan" });
    }
    if (user.otpCode !== otp) {
      return res.status(400).json({ success: false, message: "OTP tidak cocok" });
    }
    if (!user.otpCodeExpired || user.otpCodeExpired < new Date()) {
      return res.status(400).json({ success: false, message: "OTP sudah kadaluarsa" });
    }
    const phoneRegex = /^[0-9]{10,15}$/;
    if (!phoneRegex.test(nomorBaru)) {
      return res.status(400).json({ success: false, message: "Format nomor baru tidak valid" });
    }
    await User.findOneAndUpdate(
      { nomor: nomorLama },
      { nomor: nomorBaru, $unset: { otpCode: "", otpCodeExpired: "" } }
    );
    res.json({ success: true, message: "Nomor berhasil diubah", nomorBaru });
  } catch (err) {
    console.error("Error mengubah nomor:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/profile/regenerate-apikey", requireLogin, async (req, res) => {
  try {
    let newApiKey = generateApiKey();
    let apiKeyExists = await User.findOne({ apiKey: newApiKey });
    while (apiKeyExists) {
      newApiKey = generateApiKey();
      apiKeyExists = await User.findOne({ apiKey: newApiKey });
    }
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    user.apiKey = newApiKey;
    await user.save();
    return res.status(200).json({
      success: true,
      message: "API Key has been successfully regenerated",
      newApiKey: newApiKey,
    });
  } catch (err) {
    console.error("Error regenerating API Key:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

app.post("/profile/change-password", requireLogin, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: "Old password and new password are required",
    });
  }
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isOldPasswordValid) {
      return res
        .status(400)
        .json({ success: false, message: "Old password is incorrect" });
    }
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedNewPassword;
    await user.save();
    return res.status(200).json({
      success: true,
      message: "Password has been successfully changed",
    });
  } catch (err) {
    console.error("Error changing password:", err);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

app.post("/profile/send-verification-otp", requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User tidak ditemukan" });
    }

    const now = new Date();
    if (user.otpCodeExpired && user.otpCodeExpired > now) {
    } else {
      await User.updateOne({ _id: user._id }, { $set: { otpCode: null, otpCodeExpired: null } });
    }
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 10 menit
    await User.findByIdAndUpdate(
      user._id,
      {
        otpCode,
        otpCodeExpired: otpExpiry,
        aktifitas: "Verify H2H"
      }
    );
    return res.json({
      success: true,
      message: "OTP berhasil dibuat, silakan Verify H2H",
      otp: otpCode 
    });
  } catch (err) {
    console.error("Error generate OTP:", err);
    return res.status(500).json({ success: false, message: "Gagal generate OTP" });
  }
});

app.post("/profile/verify-email", requireLogin, async (req, res) => {
  const { otp } = req.body;
  if (!otp) {
    return res.status(400).json({ success: false, message: "OTP harus diisi" });
  }
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User tidak ditemukan" });
    }
    if (!user.otpCode || !user.otpCodeExpired) {
      return res.status(400).json({ success: false, message: "OTP tidak ditemukan" });
    }
    if (user.otpCode !== otp) {
      return res.status(400).json({ success: false, message: "OTP tidak cocok" });
    }
    if (user.otpCodeExpired < new Date()) {
      return res.status(400).json({ success: false, message: "OTP sudah kadaluarsa" });
    }
    await User.findByIdAndUpdate(user._id, {
      isVerified: true,
      $unset: { otpCode: "", otpCodeExpired: "" }
    });
    return res.json({ success: true, message: "H2H berhasil diverifikasi" });
  } catch (err) {
    console.error("Error verifikasi H2H:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/history/all", requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      history: user.history,
    });
  } catch (error) {
    console.error("Error fetching history:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

function isValidIp(ip) {
  return ip === '0.0.0.0' || ipRegex.test(ip);
}

app.get('/profile/whitelist-ip/add', requireLogin, async (req, res) => {
  const { ip } = req.body;
  if (!ip) {
    return res.status(400).json({ success: false, message: 'Alamat IP diperlukan' });
  }
  if (!isValidIp(ip)) {
    return res.status(400).json({ success: false, message: 'Format alamat IP tidak valid' });
  }
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
    }
    if (user.whitelistIp.includes('0.0.0.0') && ip !== '0.0.0.0' && user.whitelistIp.length === 1) {
      user.whitelistIp = [];
    }
    if (user.whitelistIp.includes(ip)) {
      return res.status(400).json({ success: false, message: 'Alamat IP sudah ada di whitelist' });
    }
    user.whitelistIp.push(ip);
    await user.save();
    return res.status(200).json({
      success: true,
      message: 'Alamat IP berhasil ditambahkan ke whitelist',
      whitelistIp: user.whitelistIp.join(',')
    });
  } catch (error) {
    console.error('Error adding IP to whitelist:', error);
    return res.status(500).json({ success: false, message: 'Kesalahan server internal' });
  }
});

app.post('/profile/whitelist-ip/remove', requireLogin, async (req, res) => {
  const { ip } = req.body;
  if (!ip) {
    return res.status(400).json({ success: false, message: 'Alamat IP diperlukan' });
  }
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
    }
    const index = user.whitelistIp.indexOf(ip);
    if (index === -1) {
      return res.status(400).json({ success: false, message: 'Alamat IP tidak ditemukan di whitelist' });
    }
    user.whitelistIp.splice(index, 1);
    if (user.whitelistIp.length === 0) {
      user.whitelistIp.push('0.0.0.0');
    }
    await user.save();
    return res.status(200).json({
      success: true,
      message: 'Alamat IP berhasil dihapus dari whitelist',
      whitelistIp: user.whitelistIp.join(',')
    });
  } catch (error) {
    console.error('Error removing IP from whitelist:', error);
    return res.status(500).json({ success: false, message: 'Kesalahan server internal' });
  }
});

app.post('/profile/whitelist-ip/set', requireLogin, async (req, res) => {
  const { ips } = req.body;
  if (!Array.isArray(ips)) {
    return res.status(400).json({ success: false, message: 'Input "ips" harus berupa array' });
  }
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan' });
    }
    if (ips.length === 0) {
      user.whitelistIp = ['0.0.0.0'];
    } else {
      for (const singleIp of ips) {
        if (typeof singleIp !== 'string' || !isValidIp(singleIp)) {
          return res.status(400).json({ success: false, message: `Format alamat IP tidak valid: ${singleIp}` });
        }
      }
      const uniqueIps = [...new Set(ips)];
      user.whitelistIp = uniqueIps;
    }
    await user.save();
    return res.status(200).json({
      success: true,
      message: 'Whitelist IP berhasil diatur ulang',
      whitelistIp: user.whitelistIp.join(',')
    });
  } catch (error) {
    console.error('Error setting IP whitelist:', error);
    return res.status(500).json({ success: false, message: 'Kesalahan server internal' });
  }
});

app.post("/exchange/coin-to-saldo", requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const { coinAmount } = req.body;

    if (!coinAmount || isNaN(coinAmount) || coinAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Jumlah coin harus lebih besar dari 0 dan berupa angka",
      });
    }

    const coinToExchange = parseInt(coinAmount);
    const saldoToAdd = Math.floor(coinToExchange / 10);

    if (user.coin < coinToExchange) {
      return res.status(400).json({
        success: false,
        message: "Coin tidak mencukupi untuk ditukar",
      });
    }

    user.coin -= coinToExchange;
    user.saldo += saldoToAdd;

    user.history.push({
      aktivitas: "Tukar Coin ke Saldo",
      nominal: saldoToAdd,
      status: "Sukses",
      code: generateReffId(),
      notes: `Tukar ${coinToExchange} coin menjadi ${saldoToAdd} saldo`,
      tanggal: new Date(),
    });

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Penukaran coin berhasil",
      data: {
        coinDikurangi: coinToExchange,
        saldoDitambahkan: saldoToAdd,
        sisaCoin: user.coin,
        totalSaldo: user.saldo,
      },
    });
  } catch (error) {
    console.error("Error saat menukar coin:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.post("/upgrade/reseller", requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.role === "reseller" || user.role === "admin") {
      return res.status(400).json({
        success: false,
        message: "Anda sudah memiliki status reseller atau admin",
      });
    }

    const totalResellers = await User.countDocuments({ role: "reseller" });

    let upgradePrice = 25000;
    if (totalResellers >= 100 && totalResellers < 300) {
      upgradePrice = 50000;
    } else if (totalResellers >= 300) {
      upgradePrice = 70000;
    }

    if (user.saldo < upgradePrice) {
      return res.status(400).json({
        success: false,
        message: `Saldo tidak mencukupi. Harga upgrade saat ini adalah ${upgradePrice}`,
      });
    }

    user.saldo -= upgradePrice;
    user.role = "reseller";

    user.history.push({
      aktivitas: "Upgrade Reseller",
      nominal: upgradePrice,
      status: "Sukses",
      code: generateReffId(),
      notes: `Upgrade ke reseller dengan harga ${upgradePrice}`,
      tanggal: new Date(),
    });

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Upgrade ke reseller berhasil",
      data: {
        role: user.role,
        sisaSaldo: user.saldo,
      },
    });
  } catch (error) {
    console.error("Error saat upgrade reseller:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});
//=====[ ORDER IN WEBSITE ]=====//

app.post("/api/categori", requireLogin, async (req, res) => {
  try {
    const url = `${BASE_URL}/layanan/price_list`;
    const params = new URLSearchParams();
    params.append("api_key", ATLAN_API_KEY);
    params.append("type", "prabayar");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: url,
      },
      body: params,
    });
    const data = await response.json();
    if (!data.status) {
      return res.status(500).json({
        success: false,
        message: "Server maintenance",
        maintenance: true,
        ip_message: data.message.replace(/[^0-9.]+/g, ""),
      });
    }
    const categories = [...new Set(data.data.map((item) => item.category))];
    res.json({
      success: true,
      data: categories,
      message: "Data kategori berhasil didapatkan",
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.post("/api/providers", requireLogin, async (req, res) => {
  try {
    const url = `${BASE_URL}/layanan/price_list`;
    const params = new URLSearchParams();
    params.append("api_key", ATLAN_API_KEY);
    params.append("type", "prabayar");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: url,
      },
      body: params,
    });
    const data = await response.json();
    if (!data.status) {
      return res.status(500).json({
        success: false,
        message: "Server maintenance",
        maintenance: true,
        ip_message: data.message.replace(/[^0-9.]+/g, ""),
      });
    }
    const providers = [...new Set(data.data.map((item) => item.provider))];
    res.json({
      success: true,
      data: providers,
      message: "Data provider berhasil didapatkan",
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server",
    });
  }
});

app.post("/api/price-list", requireLogin, async (req, res) => {
  try {
    const { category, provider } = req.body;
    const user = await User.findById(req.session.userId); 
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    const url = `${BASE_URL}/layanan/price_list`;
    const params = new URLSearchParams();
    params.append("api_key", ATLAN_API_KEY);
    params.append("type", "prabayar");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: url,
      },
      body: params,
    });
    const result = await response.json();
    if (!result.status) {
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        maintenance: true,
        ip_message: result.message.replace(/[^0-9.]+/g, ""),
      });
    }
    let data = result.data || [];
    data.sort(regeXcomp);
    if (category) {
      data = data.filter((i) => i.category && i.category.toLowerCase() === category.toLowerCase());
    }
    if (provider) {
      data = data.filter((i) => i.provider && i.provider.toLowerCase() === provider.toLowerCase());
    }
    const formattedData = data.map((i) => {
      const rawPrice = parseInt(i.price);
      let finalPrice = rawPrice;
      if (user.role === "admin") {
        finalPrice = rawPrice; // 0%
      } else if (user.role === "reseller") {
        finalPrice = Math.round(rawPrice * 1.05); // +2%
      } else {
        finalPrice = Math.round(rawPrice * 1.10); // +5%
      }
      
      return {
        code: i.code,
        name: i.name,
        category: i.category,
        type: i.type,
        provider: i.provider,
        brand_status: i.brand_status,
        status: i.status,
        img_url: i.img_url,
        final_price: finalPrice,
        price_formatted: `Rp ${toRupiah(finalPrice)}`,
        status_emoji: i.status === "available" ? "✅" : "❎",
      };
    });
    res.json({
      success: true,
      data: formattedData,
      message: footer,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.post("/deposit/methode", requireLogin, async (req, res) => {
  try {
    const { type, metode } = req.body;
    const excluded = ['OVO', 'QRIS', 'DANA', 'ovo', 'MANDIRI', 'PERMATA'];
    const url = `${BASE_URL}/deposit/metode`;
    const params = new URLSearchParams();
    params.append("api_key", ATLAN_API_KEY);
    if (type) params.append("type", type);
    if (metode) params.append("metode", metode);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    const result = await response.json();
    if (!result.status || !result.data) {
      return res.status(400).json({
        status: false,
        message: "Internal server error",
      });
    }

    const methods = result.data
      .filter((m) => !excluded.includes(m.metode))
      .map((m) => {
        const feePersen = (parseFloat(m.fee_persen || "0") + 0.5).toFixed(2);

        return {
          metode: m.metode,
          type: m.type,
          name: m.name,
          min: m.metode === "QRISFAST" ? "500" : m.min,
          max: m.max,
          fee: m.fee,
          fee_persen: feePersen,
          status: m.status,
          img_url: m.img_url,
        };
      });

    res.json({
      status: true,
      message: footer,
      data: methods,
    });
  } catch (error) {
    console.error("❌ Error metode deposit:", error.message);
    res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
});


app.post("/deposit/create", requireLogin, async (req, res) => {
  try {
    const { nominal, metode = "qrisfast", type = "ewallet" } = req.body;
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    if (!nominal) {
      return res.status(400).json({
        success: false,
        message: "Parameter nominal wajib diisi",
      });
    }
    const reff_id = generateReffId();
    const url = `${BASE_URL}/deposit/create`;
    const params = new URLSearchParams();
    params.append("api_key", ATLAN_API_KEY);
    params.append("reff_id", reff_id);
    params.append("nominal", nominal);
    params.append("type", type);
    params.append("metode", metode);
    const depositResponse = await axios.post(url, params.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    const depositData = depositResponse.data?.data;
    if (!depositData?.id) {
      return res.status(400).json({
        success: false,
        message: "Internal server error",
      });
    }
    const nominalInt = parseInt(nominal);
    const apiFee = parseInt(depositData.fee || 0);
    const additionalFee = Math.floor(nominalInt * 0.005);
    const totalFee = apiFee + additionalFee;
    const saldoMasukEstimate = nominalInt - totalFee;
    user.history.push({
      aktivitas: "Deposit",
      nominal: nominalInt,
      status: "pending",
      code: depositData.id,
      notes: `Deposit Saldo Via Api pending dengan metode ${metode}`,
      tanggal: new Date(),
    });
    await user.save();
    res.json({
      success: true,
      message: "Permintaan deposit dibuat",
      data: {
        id: depositData.id,
        reff_id: depositData.reff_id,
        nominal: nominalInt,
        tambahan: depositData.tambahan,
        fee: apiFee,
        get_balance: saldoMasukEstimate,
        qr_string: depositData.qr_string,
        qr_image: depositData.qr_image,
        status: depositData.status,
        created_at: depositData.created_at,
        expired_at: depositData.expired_at,
      },
    });
    const checkDeposit = async () => {
      const statusUrl = `${BASE_URL}/deposit/status`;
      const statusParams = new URLSearchParams();
      statusParams.append("api_key", ATLAN_API_KEY);
      statusParams.append("id", depositData.id);
      try {
        const statusResponse = await axios.post(
          statusUrl,
          statusParams.toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
          }
        );
        const statusData = statusResponse.data?.data;
        const status = statusData?.status;
        let historyIndex = user.history.findIndex(
          (h) => h.code === depositData.id
        );
        if (status === "success") {
          const originalBalance = parseInt(statusData.get_balance || saldoMasukEstimate);
          const saldoMasuk = originalBalance - additionalFee;
          user.saldo += saldoMasuk;

          // Reward coin berdasarkan role
          let rewardCoin = 0;
          if (user.role === "admin") {
            rewardCoin = 3;
          } else if (user.role === "reseller") {
            rewardCoin = 2;
          } else if (user.role === "user") {
            rewardCoin = 1;
          }
          user.coin += rewardCoin;

          if (historyIndex !== -1) {
            user.history[historyIndex].status = "Sukses";
            user.history[historyIndex].nominal = saldoMasuk;
            user.history[historyIndex].notes = `Deposit Saldo Via Api success dengan metode ${statusData.metode || metode} | Reward: ${rewardCoin} koin`;
            user.history[historyIndex].tanggal = new Date();
          } else {
            user.history.push({
              aktivitas: "Deposit",
              nominal: saldoMasuk,
              status: "Sukses",
              code: depositData.id,
              notes: `Deposit Saldo Via Api success dengan metode ${statusData.metode || metode} | Reward: ${rewardCoin} koin`,
              tanggal: new Date(),
            });
          }
          await user.save();
          return;
        } else if (status === "pending") {
          if (historyIndex !== -1) {
            user.history[historyIndex].status = "pending";
            user.history[historyIndex].notes = `Deposit Saldo Via Api pending dengan metode ${statusData.metode || metode}`;
            user.history[historyIndex].tanggal = new Date();
            await user.save();
          }
        } else if (status === "cancel") {
          if (historyIndex !== -1) {
            user.history[historyIndex].status = "cancell";
            user.history[historyIndex].notes = `Deposit Saldo Via Api cancel dengan metode ${statusData.metode || metode}`;
            user.history[historyIndex].tanggal = new Date();
            await user.save();
          }
          return;
        } else {
          if (historyIndex !== -1) {
            user.history[historyIndex].status = "cancell";
            user.history[historyIndex].notes = `Deposit Saldo Via Api status tidak dikenal: ${status} dengan metode ${statusData.metode || metode}`;
            user.history[historyIndex].tanggal = new Date();
            await user.save();
          }
          return;
        }
        setTimeout(checkDeposit, 1000);
      } catch {
        setTimeout(checkDeposit, 1000);
      }
    };
    checkDeposit();
  } catch {
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.post("/deposit/status", requireLogin, async (req, res) => {
  const { trxid } = req.body;
  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }
  if (!trxid) {
    return res.status(400).json({
      success: false,
      message: "Parameter trxid wajib diisi",
    });
  }
  try {
    const url = `${BASE_URL}/deposit/status`;
    const params = new URLSearchParams();
    params.append("api_key", ATLAN_API_KEY);
    params.append("id", trxid);
    const statusResponse = await axios.post(url, params.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    const statusData = statusResponse.data?.data;
    if (!statusData) {
      return res.status(404).json({
        success: false,
        message: "Data tidak ditemukan dari server eksternal",
      });
    }
    const getBalance = parseInt(statusData.get_balance || 0);
    const feeInternal = Math.floor(getBalance * 0.005); 
    const saldoMasuk = getBalance - feeInternal;
    return res.json({
      success: true,
      message: "Status deposit ditemukan",
      data: {
        trxid: statusData.reff_id,
        status: statusData.status,
        nominal: parseInt(statusData.nominal || 0),
        metode: statusData.metode || "Tidak diketahui",
        fee_dari_api: parseInt(statusData.fee || 0),
        saldo_masuk: saldoMasuk,
        created_at: statusData.created_at,
      },
    });
  } catch (error) {
    console.error("❌ Error saat cek status deposit:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.post("/deposit/cancel", requireLogin, async (req, res) => {
  const { trxid } = req.body;
  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }
  if (!trxid) {
    return res.status(400).json({
      success: false,
      message: "Parameter trxid wajib diisi",
    });
  }
  try {
    const url = `${BASE_URL}/deposit/cancel`;
    const params = new URLSearchParams();
    params.append("api_key", ATLAN_API_KEY);
    params.append("id", trxid);
    const cancelResponse = await axios.post(url, params.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    const cancelData = cancelResponse.data?.data;
    if (!cancelData) {
      return res.status(404).json({
        success: false,
        message: "Data tidak ditemukan dari server eksternal",
      });
    }
    return res.json({
      success: true,
      message: "Deposit berhasil dibatalkan",
      data: {
        trxid: cancelData.id,
        status: cancelData.status,
        created_at: cancelData.created_at,
      },
    });
  } catch (error) {
    console.error("❌ Error saat membatalkan deposit:", error);
    if (error.response?.data) {
      return res.status(error.response.status || 500).json({
        success: false,
        message: error.response.data.message || "Gagal membatalkan deposit",
      });
    }
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.post("/order/create", requireLogin, async (req, res) => {
  try {
    const { code, target } = req.body;
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    if (!code || !target) {
      return res.status(400).json({
        success: false,
        message: "Parameter code dan target wajib diisi",
      });
    }
    const priceListUrl = `${BASE_URL}/layanan/price_list`;
    const priceParams = new URLSearchParams({ api_key: ATLAN_API_KEY, type: "prabayar" });
    const priceResponse = await axios.post(priceListUrl, priceParams, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!priceResponse.data.status) {
      return res.status(503).json({
        success: false,
        message: "Server H2H maintenance",
      });
    }
    const product = priceResponse.data.data.find(item => item.code === code);
    if (!product || isNaN(parseInt(product.price))) {
      return res.status(404).json({
        success: false,
        message: "Produk tidak ditemukan atau harga tidak valid",
      });
    }
    const basePrice = parseInt(product.price);
    const feePercent = user.role === "reseller" ? 0.05 : user.role === "admin" ? 0 : 0.10;
    const totalPrice = Math.round(basePrice * (1 + feePercent));
    if (user.saldo < totalPrice) {
      user.history.push({
        aktivitas: "Order",
        nominal: totalPrice,
        status: "Gagal - Saldo tidak cukup",
        code: generateReffId(),
        tanggal: new Date(),
        notes: `Order ${code} target ${target}`,
      });
      await user.save();
      return res.status(400).json({
        success: false,
        message: "Saldo tidak mencukupi",
      });
    }
    const reff_id = generateReffId();
    const transactionParams = new URLSearchParams({
      api_key: ATLAN_API_KEY,
      code,
      reff_id,
      target,
    });
    const trxResponse = await axios.post(`${BASE_URL}/transaksi/create`, transactionParams, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    const trx = trxResponse.data?.data;
    if (!trx?.id || !trx?.price) {
      return res.status(502).json({
        success: false,
        message: "Internal server error",
      });
    }
    user.history.push({
      aktivitas: `Order`,
      nominal: totalPrice,
      status: "Pending",
      code: trx.id,
      notes: `Order ${code} target ${target}`,
      tanggal: new Date(),
    });
    await user.save();
    res.json({
      success: true,
      message: "Transaksi berhasil dibuat",
      data: {
        ...trx,
        price: totalPrice,
      },
    });
    const checkStatus = async () => {
      try {
        const statusParams = new URLSearchParams({
          api_key: ATLAN_API_KEY,
          id: trx.id,
          type: "prabayar",
        });
        const statusResponse = await axios.post(`${BASE_URL}/transaksi/status`, statusParams, {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        const status = statusResponse.data.data?.status;
        if (status === "success") {
          user.saldo -= totalPrice;
          if (user.role === "reseller") {
            user.coin += Math.floor(totalPrice * 0.01);
          }
          user.history.push({
            aktivitas: `Order`,
            nominal: totalPrice,
            status: "Sukses",
            code: trx.id,
            notes: `Order ${code} target ${target}`,
            tanggal: new Date(),
          });
          await user.save();
          console.log(`✅ Order ${trx.id} sukses. Saldo dipotong.`);
          return;
        }
        if (status === "failed") {
          user.history.push({
            aktivitas: `Order`,
            nominal: totalPrice,
            status: "Gagal",
            code: trx.id,
            notes: `Order ${code} target ${target}`,
            tanggal: new Date(),
          });
          await user.save();
          console.log(`❌ Order ${trx.id} gagal.`);
          return;
        }
        setTimeout(checkStatus, 1000);
      } catch (err) {
        console.error("❌ Error saat cek status:", err.response?.data || err.message);
        setTimeout(checkStatus, 1000);
      }
    };
    checkStatus();
  } catch (error) {
    console.error("❌ Error create order:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.post("/order/check", requireLogin, async (req, res) => {
  try {
    const { trxid } = req.body; 
    const user = await User.findById(req.session.userId); 
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    if (!trxid) {
      return res.status(400).json({
        success: false,
        message: 'Parameter "trxid" harus diisi',
      });
    }
    const statusUrl = `${BASE_URL}/transaksi/status`;
    const statusParams = new URLSearchParams({
      api_key: ATLAN_API_KEY,
      id: trxid,
      type: "prabayar",
    });
    const response = await axios.post(statusUrl, statusParams, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    const trx = response.data?.data;
    if (!trx?.status) {
      return res.status(404).json({
        success: false,
        message: "Transaksi tidak ditemukan atau gagal mendapatkan status",
      });
    }
    let statusMessage = "Status transaksi tidak diketahui";
    if (trx.status === "success") statusMessage = "Transaksi berhasil";
    else if (trx.status === "pending") statusMessage = "Transaksi sedang diproses";
    else if (trx.status === "failed") statusMessage = "Transaksi gagal";
    const basePrice = parseInt(trx.price);
    const feePercent = user.role === "reseller" ? 0.05 : user.role === "admin" ? 0 : 0.10;
    const totalPrice = Math.round(basePrice * (1 + feePercent));
    res.json({
      success: true,
      message: statusMessage,
      data: {
        id: trx.id,
        reff_id: trx.reff_id,
        layanan: trx.layanan,
        code: trx.code,
        target: trx.target,
        price: totalPrice,
        sn: trx.sn,
        status: trx.status,
        created_at: trx.created_at,
      },
    });
  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});


//=====[ PRODUCT ENDPOINT ]=====//

async function getServerPublicIp() {
  try {
    const response = await axios.get('https://api.ipify.org?format=json');
    return response.data.ip;
  } catch (error) {
    return null;
  }
}

function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-apikey'] || req.query.apikey;
  if (!apiKey) {
    return res.status(400).json({
      success: false,
      message: 'API Key harus disertakan di header "X-APIKEY" atau query param "apikey"',
    });
  }
  User.findOne({ apiKey })
    .then(async (user) => {
      if (!user) {
        return res.status(401).json({
          success: false,
          message: "Invalid API Key",
        });
      }
      const requestIp =
        req.headers['x-forwarded-for']?.split(',').shift().trim() || 
        req.ip ||
        req.connection.remoteAddress; 
      const detectedIp = ['::1', '127.0.0.1'].includes(requestIp)
        ? await getServerPublicIp()
        : requestIp;
      const whitelistIpArray = Array.isArray(user.whitelistIp)
        ? user.whitelistIp
        : user.whitelistIp.split(',').map(ip => ip.trim());
      if (whitelistIpArray.length > 0 && !whitelistIpArray.includes('0.0.0.0')) {
        if (!detectedIp || !whitelistIpArray.includes(detectedIp)) {
          console.warn(`Unauthorized API access from IP ${detectedIp} for user ${user.username}. IP not in whitelist: [${whitelistIpArray.join(', ')}]`);
          return res.status(403).json({
            success: false,
            message: "IP Anda saat ini tidak diizinkan untuk menggunakan API Key ini.",
            your_ip: detectedIp
          });
        }
      }
      if (user.isLocked) {
        return res.status(429).json({
          success: false,
          message: "Anda harus menunggu 5 detik sebelum melakukan request lagi.",
        });
      }
      user.isLocked = true;
      await user.save();
      setTimeout(async () => {
        try {
          if (!user.isVerified) {
            return res.status(403).json({
              success: false,
              message: "Akun belum terverifikasi. Silakan verifikasi akun terlebih dahulu.",
            });
          }
          req.user = user;
          next();
        } catch (error) {
          console.error("Error during API Key validation timeout:", error);
          return res.status(500).json({
            success: false,
            message: "Internal server error during validation",
          });
        } finally {
          user.isLocked = false;
          try {
            await user.save();
          } catch (saveError) {
            console.error("Error saving user after unlocking in validateApiKey:", saveError);
          }
        }
      }, 5000);
    })
    .catch((error) => {
      console.error("Error validating API Key (DB query):", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    });
}

const customImageUrl =
  "https://i.pinimg.com/236x/f2/7d/e0/f27de0e4a01ba9dfe8607ac03a4f7aae.jpg";
const regeXcomp = (a, b) => {
  const aPrice = Number(a.price.replace(/[^0-9.-]+/g, ""));
  const bPrice = Number(b.price.replace(/[^0-9.-]+/g, ""));
  return aPrice - bPrice;
};
const calculateFinalPrice = (price) => {
  const cleanPrice = Number(price.toString().replace(/[^0-9.-]+/g, ""));
  const markup = cleanPrice * 0.02; 
  return Math.round(cleanPrice + markup); 
};
const toRupiah = (value) => {
  return value.toLocaleString("id-ID");
};
function generateReffId() {
  return "TRX-" + Math.random().toString(36).substring(2, 10).toUpperCase();
}


app.get("/api/profile", validateApiKey, async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    const userData = {
      fullname: user.fullname,
      username: user.username,
      nomor: user.nomor,
      email: user.email,
      profileUrl: user.profileUrl,
      saldo: user.saldo,
      coin: user.coin,
      apiKey: user.apiKey,
      tanggalDaftar: user.tanggalDaftar,
      role: user.role,
      isVerified: user.isVerified,
      lastLogin: user.lastLogin,
      referralCode: user.referralCode,
      history: user.history.slice(-5).reverse(),
    };
    res.json({
      success: true,
      message: "Profile data retrieved successfully",
      data: userData,
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.get("/api/mutasi", validateApiKey, async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    return res.status(200).json({
      success: true,
      history: user.history,
    });
  } catch (error) {
    console.error("Error fetching history:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});
//=====[ ATLANTIC INTEGRATION ]=====//

app.get("/h2h/categori", validateApiKey, async (req, res) => {
  try {
    const url = `${BASE_URL}/layanan/price_list`;
    const params = new URLSearchParams();
    params.append("api_key", ATLAN_API_KEY);
    params.append("type", "prabayar");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: url,
      },
      body: params,
    });
    const data = await response.json();
    if (!data.status) {
      return res.status(500).json({
        status: false,
        message: "Server maintenance",
        maintenance: true,
        ip_message: data.message.replace(/[^0-9.]+/g, ""),
      });
    }
    const categories = [...new Set(data.data.map((item) => item.category))];
    res.json({
      status: true,
      data: categories,
      message: footer,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
});

app.get("/h2h/provider", validateApiKey, async (req, res) => {
  try {
    const url = `${BASE_URL}/layanan/price_list`;
    const params = new URLSearchParams();
    params.append("api_key", ATLAN_API_KEY);
    params.append("type", "prabayar");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: url,
      },
      body: params,
    });
    const data = await response.json();
    if (!data.status) {
      return res.status(500).json({
        status: false,
        message: "Internal server error",
        maintenance: true,
        ip_message: data.message.replace(/[^0-9.]+/g, ""),
      });
    }
    const providers = [...new Set(data.data.map((item) => item.provider))];
    res.json({
      status: true,
      data: providers,
      message: footer, 
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
});

app.get("/h2h/products", validateApiKey, async (req, res) => {
  try {
    const { category, provider } = req.query;
    const user = req.user;
    const url = `${BASE_URL}/layanan/price_list`;
    const params = new URLSearchParams();
    params.append("api_key", ATLAN_API_KEY);
    params.append("type", "prabayar");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: url,
      },
      body: params,
    });
    const result = await response.json();
    if (!result.status) {
      return res.status(500).json({
        status: false,
        message: "Internal server error",
        maintenance: true,
        ip_message: result.message.replace(/[^0-9.]+/g, ""),
      });
    }
    let data = result.data || [];
    data.sort(regeXcomp);
    if (category) {
      data = data.filter((i) => i.category && i.category.toLowerCase() === category.toLowerCase());
    }
    if (provider) {
      data = data.filter((i) => i.provider && i.provider.toLowerCase() === provider.toLowerCase());
    }
    const formattedData = data.map((i) => {
      const rawPrice = parseInt(i.price);
      const feePercent = user.role === "reseller" ? 0.05 : user.role === "admin" ? 0 : 0.10;
      const finalPrice = Math.round(rawPrice * (1 + feePercent));
      return {
        code: i.code,
        name: i.name,
        category: i.category,
        type: i.type,
        provider: i.provider,
        brand_status: i.brand_status,
        status: i.status,
        img_url: i.img_url,
        final_price: finalPrice,
        price: finalPrice,
        price_formatted: `Rp ${toRupiah(finalPrice)}`,
        status_emoji: i.status === "available" ? "✅" : "❎",
      };
    });
    res.json({
      status: true,
      data: formattedData,
      message: footer,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
});

app.get("/h2h/deposit/methode", validateApiKey, async (req, res) => {
  try {
    const { type, metode } = req.query;
    const excluded = ['OVO', 'QRIS', 'DANA', 'ovo', 'MANDIRI', 'PERMATA'];
    const url = `${BASE_URL}/deposit/metode`;
    const params = new URLSearchParams();
    params.append("api_key", ATLAN_API_KEY);
    if (type) params.append("type", type);
    if (metode) params.append("metode", metode);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    const result = await response.json();
    if (!result.status || !result.data) {
      return res.status(400).json({
        status: false,
        message: "Internal server error",
      });
    }
    const methods = result.data
      .filter((m) => !excluded.includes(m.metode))
      .map((m) => ({
        metode: m.metode,
        type: m.type,
        name: m.name,
        min: m.min,
        max: m.max,
        fee: m.fee,
        fee_persen: (parseFloat(m.fee_persen || "0") + 0.5).toFixed(2),
        status: m.status,
        img_url: m.img_url,
      }));
    res.json({
      status: true,
      message: footer,
      data: methods,
    });
  } catch (error) {
    console.error("❌ Error metode deposit:", error.message);
    res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
});

app.get("/h2h/deposit/create", validateApiKey, async (req, res) => {
  try {
    const { nominal, metode = "qrisfast", type = "ewallet" } = req.query;
    const user = req.user;
    if (!nominal) {
      return res.status(400).json({
        success: false,
        message: "Parameter nominal wajib diisi",
      });
    }
    const reff_id = generateReffId();
    const url = `${BASE_URL}/deposit/create`;
    const params = new URLSearchParams();
    params.append("api_key", ATLAN_API_KEY);
    params.append("reff_id", reff_id);
    params.append("nominal", nominal);
    params.append("type", type);
    params.append("metode", metode);
    const depositResponse = await axios.post(url, params.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    const depositData = depositResponse.data?.data;
    if (!depositData?.id) {
      return res.status(400).json({
        success: false,
        message: "Internal server error",
      });
    }
    const nominalInt = parseInt(nominal);
    const apiFee = parseInt(depositData.fee || 0);
    const additionalFee = Math.floor(nominalInt * 0.005);
    const totalFee = apiFee + additionalFee;
    const saldoMasukEstimate = nominalInt - totalFee;
    user.history.push({
      aktivitas: "Deposit",
      nominal: nominalInt,
      status: "pending",
      code: depositData.id,
      notes: `Deposit Saldo Via Api pending dengan metode ${metode}`,
      tanggal: new Date(),
    });
    await user.save();
    res.json({
      success: true,
      message: "Permintaan deposit dibuat",
      data: {
        id: depositData.id,
        reff_id: depositData.reff_id,
        nominal: nominalInt,
        tambahan: depositData.tambahan,
        fee: apiFee,
        get_balance: saldoMasukEstimate,
        qr_string: depositData.qr_string,
        qr_image: depositData.qr_image,
        status: depositData.status,
        created_at: depositData.created_at,
        expired_at: depositData.expired_at,
      },
    });
    const checkDeposit = async () => {
      const statusUrl = `${BASE_URL}/deposit/status`;
      const statusParams = new URLSearchParams();
      statusParams.append("api_key", ATLAN_API_KEY);
      statusParams.append("id", depositData.id);
      try {
        const statusResponse = await axios.post(
          statusUrl,
          statusParams.toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
          }
        );
        const statusData = statusResponse.data?.data;
        const status = statusData?.status;
        let historyIndex = user.history.findIndex(
          (h) => h.code === depositData.id
        );
        if (status === "success") {
          const originalBalance = parseInt(statusData.get_balance || saldoMasukEstimate);
          const saldoMasuk = originalBalance - additionalFee;
          user.saldo += saldoMasuk;

          let rewardCoin = 0;
          if (user.role === "admin") {
            rewardCoin = 3;
          } else if (user.role === "reseller") {
            rewardCoin = 2;
          } else if (user.role === "user") {
            rewardCoin = 1;
          }
          user.coin += rewardCoin;

          if (historyIndex !== -1) {
            user.history[historyIndex].status = "Sukses";
            user.history[historyIndex].nominal = saldoMasuk;
            user.history[historyIndex].notes = `Deposit Saldo Via Api success dengan metode ${statusData.metode || metode} | Reward: ${rewardCoin} koin`;
            user.history[historyIndex].tanggal = new Date();
          } else {
            user.history.push({
              aktivitas: "Deposit",
              nominal: saldoMasuk,
              status: "Sukses",
              code: depositData.id,
              notes: `Deposit Saldo Via Api success dengan metode ${statusData.metode || metode} | Reward: ${rewardCoin} koin`,
              tanggal: new Date(),
            });
          }
          await user.save();
          return;
        } else if (status === "pending") {
          if (historyIndex !== -1) {
            user.history[historyIndex].status = "pending";
            user.history[historyIndex].notes = `Deposit Saldo Via Api pending dengan metode ${statusData.metode || metode}`;
            user.history[historyIndex].tanggal = new Date();
            await user.save();
          }
        } else if (status === "cancel") {
          if (historyIndex !== -1) {
            user.history[historyIndex].status = "cancell";
            user.history[historyIndex].notes = `Deposit Saldo Via Api cancel dengan metode ${statusData.metode || metode}`;
            user.history[historyIndex].tanggal = new Date();
            await user.save();
          }
          return;
        } else {
          if (historyIndex !== -1) {
            user.history[historyIndex].status = "cancell";
            user.history[historyIndex].notes = `Deposit Saldo Via Api status tidak dikenal: ${status} dengan metode ${statusData.metode || metode}`;
            user.history[historyIndex].tanggal = new Date();
            await user.save();
          }
          return;
        }
        setTimeout(checkDeposit, 1000);
      } catch {
        setTimeout(checkDeposit, 1000);
      }
    };
    checkDeposit();
  } catch {
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.get("/h2h/deposit/status", validateApiKey, async (req, res) => {
  const { trxid } = req.query;
  const user = req.user;
  if (!trxid) {
    return res.status(400).json({
      success: false,
      message: "Parameter trxid wajib diisi",
    });
  }
  try {
    const url = `${BASE_URL}/deposit/status`;
    const params = new URLSearchParams();
    params.append("api_key", ATLAN_API_KEY);
    params.append("id", trxid);
    const statusResponse = await axios.post(url, params.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    const statusData = statusResponse.data?.data;
    if (!statusData) {
      return res.status(404).json({
        success: false,
        message: "Data tidak ditemukan dari server eksternal",
      });
    }
    const getBalance = parseInt(statusData.get_balance || 0);
    const feeInternal = Math.floor(getBalance * 0.005); 
    const saldoMasuk = getBalance - feeInternal;
    return res.json({
      success: true,
      message: "Status deposit ditemukan",
      data: {
        trxid: statusData.reff_id,
        status: statusData.status,
        nominal: parseInt(statusData.nominal || 0),
        metode: statusData.metode || "Tidak diketahui",
        fee_dari_api: parseInt(statusData.fee || 0),
        saldo_masuk: saldoMasuk,
        created_at: statusData.created_at,
      },
    });
  } catch (error) {
    console.error("❌ Error saat cek status deposit:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.get("/h2h/deposit/cancel", validateApiKey, async (req, res) => {
  const { trxid } = req.query;
  const user = req.user;
  if (!trxid) {
    return res.status(400).json({
      success: false,
      message: "Parameter trxid wajib diisi",
    });
  }
  try {
    const url = `${BASE_URL}/deposit/cancel`;
    const params = new URLSearchParams();
    params.append("api_key", ATLAN_API_KEY);
    params.append("id", trxid);
    const cancelResponse = await axios.post(url, params.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    const cancelData = cancelResponse.data?.data;
    if (!cancelData) {
      return res.status(404).json({
        success: false,
        message: "Data tidak ditemukan dari server eksternal",
      });
    }
    return res.json({
      success: true,
      message: "Deposit berhasil dibatalkan",
      data: {
        trxid: cancelData.id,
        status: cancelData.status,
        created_at: cancelData.created_at,
      },
    });
  } catch (error) {
    console.error("❌ Error saat membatalkan deposit:", error);
    if (error.response?.data) {
      return res.status(error.response.status || 500).json({
        success: false,
        message: error.response.data.message || "Gagal membatalkan deposit",
      });
    }
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});


app.get("/h2h/order/create", validateApiKey, async (req, res) => {
  try {
    const { code, target } = req.query;
    const user = req.user;
    if (!code || !target) {
      return res.status(400).json({
        success: false,
        message: "Parameter code dan target wajib diisi",
      });
    }
    const priceListUrl = `${BASE_URL}/layanan/price_list`;
    const priceParams = new URLSearchParams({ api_key: ATLAN_API_KEY, type: "prabayar" });
    const priceResponse = await axios.post(priceListUrl, priceParams, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!priceResponse.data.status) {
      return res.status(503).json({
        success: false,
        message: "Server H2H maintenance",
      });
    }
    const product = priceResponse.data.data.find(item => item.code === code);
    if (!product || isNaN(parseInt(product.price))) {
      return res.status(404).json({
        success: false,
        message: "Produk tidak ditemukan atau harga tidak valid",
      });
    }
    const basePrice = parseInt(product.price);
    const feePercent = user.role === "reseller" ? 0.05 : user.role === "admin" ? 0 : 0.10;
    const totalPrice = Math.round(basePrice * (1 + feePercent));
    if (user.saldo < totalPrice) {
      user.history.push({
        aktivitas: "Order",
        nominal: totalPrice,
        status: "Gagal - Saldo tidak cukup",
        code: generateReffId(),
        tanggal: new Date(),
        notes: `Order ${code} target ${target}`,
      });
      await user.save();
      return res.status(400).json({
        success: false,
        message: "Saldo tidak mencukupi",
      });
    }
    const reff_id = generateReffId();
    const transactionParams = new URLSearchParams({
      api_key: ATLAN_API_KEY,
      code,
      reff_id,
      target,
    });
    const trxResponse = await axios.post(`${BASE_URL}/transaksi/create`, transactionParams, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    const trx = trxResponse.data?.data;
    if (!trx?.id || !trx?.price) {
      return res.status(502).json({
        success: false,
        message: "Internal server error",
      });
    }
    user.history.push({
      aktivitas: `Order`,
      nominal: totalPrice,
      status: "Pending",
      code: trx.id,
      notes: `Order ${code} target ${target}`,
      tanggal: new Date(),
    });
    await user.save();
    res.json({
      success: true,
      message: "Transaksi berhasil dibuat",
      data: {
        ...trx,
        price: totalPrice,
      },
    });
    const checkStatus = async () => {
      try {
        const statusParams = new URLSearchParams({
          api_key: ATLAN_API_KEY,
          id: trx.id,
          type: "prabayar",
        });
        const statusResponse = await axios.post(`${BASE_URL}/transaksi/status`, statusParams, {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        const status = statusResponse.data.data?.status;
        if (status === "success") {
          user.saldo -= totalPrice;
          if (user.role === "reseller") {
            user.coin += Math.floor(totalPrice * 0.01);
          }
          user.history.push({
            aktivitas: `Order`,
            nominal: totalPrice,
            status: "Sukses",
            code: trx.id,
            notes: `Order ${code} target ${target}`,
            tanggal: new Date(),
          });
          await user.save();
          console.log(`✅ Order ${trx.id} sukses. Saldo dipotong.`);
          return;
        }
        if (status === "failed") {
          user.history.push({
            aktivitas: `Order`,
            nominal: totalPrice,
            status: "Gagal",
            code: trx.id,
            notes: `Order ${code} target ${target}`,
            tanggal: new Date(),
          });
          await user.save();
          console.log(`❌ Order ${trx.id} gagal.`);
          return;
        }
        setTimeout(checkStatus, 1000);
      } catch (err) {
        console.error("❌ Error saat cek status:", err.response?.data || err.message);
        setTimeout(checkStatus, 1000);
      }
    };
    checkStatus();
  } catch (error) {
    console.error("❌ Error create order:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});


app.get("/h2h/order/check", validateApiKey, async (req, res) => {
  try {
    const { trxid } = req.query;
    const user = req.user;
    if (!trxid) {
      return res.status(400).json({
        success: false,
        message: 'Parameter "trxid" harus diisi',
      });
    }
    const statusUrl = `${BASE_URL}/transaksi/status`;
    const statusParams = new URLSearchParams({
      api_key: ATLAN_API_KEY,
      id: trxid,
      type: "prabayar",
    });
    const response = await axios.post(statusUrl, statusParams, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    const trx = response.data?.data;
    if (!trx?.status) {
      return res.status(404).json({
        success: false,
        message: "Transaksi tidak ditemukan atau gagal mendapatkan status",
      });
    }
    let statusMessage = "Status transaksi tidak diketahui";
    if (trx.status === "success") statusMessage = "Transaksi berhasil";
    else if (trx.status === "pending") statusMessage = "Transaksi sedang diproses";
    else if (trx.status === "failed") statusMessage = "Transaksi gagal";
    const basePrice = parseInt(trx.price);
    const feePercent = user.role === "reseller" ? 0.05 : user.role === "admin" ? 0 : 0.10;
    const totalPrice = Math.round(basePrice * (1 + feePercent));
    res.json({
      success: true,
      message: statusMessage,
      data: {
        id: trx.id,
        reff_id: trx.reff_id,
        layanan: trx.layanan,
        code: trx.code,
        target: trx.target,
        price: totalPrice,
        sn: trx.sn,
        status: trx.status,
        created_at: trx.created_at,
      },
    });
  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.get("/api/v1/buy-panel", validateApiKey, async (req, res) => {
  const { username, paket } = req.query;
  const user = req.user;
  const availablePackets = ["1gb", "2gb", "3gb", "4gb", "5gb", "6gb", "7gb", "8gb", "9gb", "20gb", "unli"];
  if (!username) {
    return res.status(400).json({
      success: false,
      message: "Parameter 'username' harus diisi",
    });
  }
  if (!paket || !availablePackets.includes(paket.toLowerCase())) {
    return res.status(400).json({
      success: false,
      message: `Paket tidak valid. Paket yang tersedia: ${availablePackets.join(", ")}`,
    });
  }
  let memo, disk, cpu, harga;
  switch (paket.toLowerCase()) {
    case "1gb":
      memo = 1024;
      disk = 1024;
      cpu = 50;
      harga = 1000;
      break;
    case "2gb":
      memo = 2048;
      disk = 2048;
      cpu = 100;
      harga = 2000;
      break;
    case "3gb":
      memo = 3072;
      disk = 3072;
      cpu = 150;
      harga = 3000;
      break;
    case "4gb":
      memo = 4096;
      disk = 4096;
      cpu = 200;
      harga = 4000;
      break;
    case "5gb":
      memo = 5120;
      disk = 5120;
      cpu = 250;
      harga = 5000;
      break;
    case "6gb":
      memo = 6144;
      disk = 6144;
      cpu = 300;
      harga = 6000;
      break;
    case "7gb":
      memo = 7168;
      disk = 7168;
      cpu = 350;
      harga = 7000;
      break;
    case "8gb":
      memo = 8192;
      disk = 8192;
      cpu = 400;
      harga = 8000;
      break;
    case "9gb":
      memo = 9216;
      disk = 9216;
      cpu = 450;
      harga = 9000;
      break;
    case "10gb":
      memo = 10240;
      disk = 10240;
      cpu = 500;
      harga = 10000;
      break;
    case "unli":
      memo = 0;
      disk = 0;
      cpu = 0;
      harga = 15000;
      break;
    default:
      return res.status(400).json({
        success: false,
        message: "Paket tidak dikenali",
      });
  }
  if (user.saldo < harga) {
    user.history.push({
      aktivitas: "Buy Panel",
      nominal: harga,
      status: "Gagal - Saldo tidak mencukupi",
      tanggal: new Date(),
    });
    await user.save();
    return res.status(400).json({
      success: false,
      message: "Saldo tidak mencukupi",
    });
  }
  try {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${apikey}`,
    };
    const email = `${username}@gmail.com`;
    const password = `${username}${disk}`; 
    const createUserResponse = await axios.post(
      `${domain}/api/application/users`,
      {
        email,
        username,
        first_name: username,
        last_name: username,
        language: "en",
        password,
      },
      { headers }
    );
    const newUser = createUserResponse.data.attributes;
    const createServerResponse = await axios.post(
      `${domain}/api/application/servers`,
      {
        name: username,
        description: "Server dibuat via API Buy Panel",
        user: newUser.id,
        egg: 15, 
        docker_image: "ghcr.io/parkervcp/yolks:nodejs_18",
        startup: "npm start",
        environment: {
          INST: "npm",
          USER_UPLOAD: "0",
          AUTO_UPDATE: "0",
          CMD_RUN: "npm start",
          JS_FILE: "index.js",
        },
        limits: {
          memory: memo,
          swap: 0,
          disk,
          io: 500,
          cpu,
        },
        feature_limits: {
          databases: 5,
          backups: 5,
          allocations: 5,
        },
        deploy: {
          locations: [1],
          dedicated_ip: false,
          port_range: [],
        },
      },
      { headers }
    );
    const newServer = createServerResponse.data.attributes;
    user.saldo -= harga;
    user.history.push({
      aktivitas: "Buy Panel",
      nominal: harga,
      status: "Sukses",
      tanggal: new Date(),
    });
    await user.save();
    return res.status(201).json({
      success: true,
      message: "Server berhasil dibuat",
      data: {
        user: {
          id: newUser.id,
          username: newUser.username,
          email,
          password,
        },
        server: {
          id: newServer.id,
          name: newServer.name,
          memory: memo,
          disk,
          cpu,
        },
      },
    });
  } catch (error) {
    console.error("Error creating server:", error.response?.data || error.message);
    user.history.push({
      aktivitas: "Buy Panel",
      nominal: harga,
      status: "Gagal - Internal server error",
      tanggal: new Date(),
    });
    await user.save();
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat membuat server",
      error: error.response?.data || error.message,
    });
  }
});

//=====[ ADMIN BACKEND ]=====//

app.get("/data/users", requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}, "-password -__v");
    res.json(users);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

app.post('/admin/verify-user', requireAdmin, async (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({
      success: false,
      message: 'Parameter username wajib diisi'
    });
  }
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User tidak ditemukan'
      });
    }
    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'User sudah terverifikasi sebelumnya'
      });
    }
    user.isVerified = true;
    await user.save();
    return res.status(200).json({
      success: true,
      message: `User ${username} berhasil diverifikasi`
    });
  } catch (err) {
    console.error('Error saat memverifikasi user:', err);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan pada server'
    });
  }
});

app.post("/admin/unblock-user", requireAdmin, async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "Parameter userId wajib diisi",
    });
  }
  try {
    const user = await User.findById(userId); 
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }
    if (!user.isLocked) {
      return res.status(400).json({
        success: false,
        message: "User tidak dalam keadaan terblokir",
      });
    }
    user.isLocked = false;
    await user.save();
    return res.status(200).json({
      success: true,
      message: `User ${user.username} berhasil di-unblock`,
    });
  } catch (error) {
    console.error("Error unblocking user:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

/*
app.listen(3000, '0.0.0.0', () => {
  console.log('Server running di http://192.168.36.240:3000');
});
*/
