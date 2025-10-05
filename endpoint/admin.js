const express = require("express");
const axios = require("axios");
const cloudscraper = require("cloudscraper")
const qs = require("qs");
const app = express();
const router = express.Router();
app.use(express.urlencoded({
  extended: true
}));
app.use(express.json());

const {
  validateApiKey,
  User,
  tambahHistoryDeposit,
  generateReffId,
  BASE_URL,
  ATLAN_API_KEY,
  editHistoryDeposit,
  tambahHistoryOrder,
  editHistoryOrder,
  requireAdmin
} = require("../index.js");


router.get("/profile", requireAdmin, async (req, res) => {
  try {
    const formData = {
      api_key: process.env.ATLAN_API_KEY,
    };

    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
    };

    const response = await cloudscraper.post(
      "https://atlantich2h.com/get_profile",
      {
        body: qs.stringify(formData),
        headers,
      }
    );

    const result = JSON.parse(response);

    // ✅ jika API status true → kirim ulang sama persis
    if (result && result.status === "true") {
      return res.status(200).json({
        status: "true",
        message: result.message || "Data retrieved successfully",
        data: {
          name: result.data?.name || "",
          username: result.data?.username || "",
          email: result.data?.email || "",
          phone: result.data?.phone || "",
          balance: result.data?.balance || "0",
          status: result.data?.status || "",
          access: process.env.ATLAN_API_KEY,
          connect: process.env.MONGODB_URI
        },
      });
    }

    return res.status(200).json({
      status: "false",
      message: "Failed to retrieve data",
      data: {
        name: "0",
        username: "0",
        email: "0",
        phone: "0",
        balance: "0",
        status: "0",
      },
    });
  } catch (error) {
    console.error("Error get_profile:", error?.message);

    // ❌ jika error apa pun → tetap balikin format sama
    return res.status(200).json({
      status: "false",
      message: "Error fetching profile",
      data: {
        name: "0",
        username: "0",
        email: "0",
        phone: "0",
        balance: "0",
        status: "0",
      },
    });
  }
});
router.get("/data/users", requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}, "-password -__v");
    res.json(users);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

router.get("/data/users", requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}, "-password -__v");
    res.json(users);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

router.post("/user/update-balance", requireAdmin, async (req, res) => {
  const { username, newSaldo, newCoin } = req.body;

  if (!username) {
    return res.status(400).json({ success: false, message: "Username wajib diisi." });
  }

  const saldoValue = parseFloat(newSaldo);
  const coinValue = parseFloat(newCoin);

  if (newSaldo !== undefined && (isNaN(saldoValue) || saldoValue < 0)) {
    return res.status(400).json({ success: false, message: "Nilai saldo tidak valid." });
  }
  if (newCoin !== undefined && (isNaN(coinValue) || coinValue < 0)) {
    return res.status(400).json({ success: false, message: "Nilai coin tidak valid." });
  }

  try {
    const user = await User.findOne({ username: username });
    if (!user) {
      return res.status(404).json({ success: false, message: `User '${username}' tidak ditemukan.` });
    }

    if (newSaldo !== undefined) {
      user.saldo = saldoValue;
    }
    if (newCoin !== undefined) {
      user.coin = coinValue;
    }

    await user.save();
    
    console.log(`[ADMIN] Saldo/Coin user ${user.username} diupdate oleh admin ${req.session.userId}.`);
    
    return res.status(200).json({
      success: true,
      message: `Data saldo dan coin untuk user '${user.username}' berhasil diperbarui.`,
      data: {
        username: user.username,
        saldo: user.saldo,
        coin: user.coin,
      },
    });
  } catch (error) {
    console.error("Error saat admin update balance:", error);
    return res.status(500).json({ success: false, message: "Terjadi kesalahan pada server." });
  }
});

router.post("/update-deposit-status", requireAdmin, async (req, res) => {
  const { userId, depositId, newStatus } = req.body;

  if (!userId || !depositId || !newStatus) {
    return res.status(400).json({
      success: false,
      message: "Parameter userId, depositId, dan newStatus wajib diisi.",
    });
  }

  try {
    const result = await editHistoryDeposit(userId, depositId, newStatus);
    
    if (!result) {
        return res.status(404).json({ success: false, message: "User atau transaksi deposit tidak ditemukan." });
    }

    return res.status(200).json({
      success: true,
      message: `Status deposit dengan ID ${depositId} berhasil diubah menjadi ${newStatus}.`,
    });

  } catch (error) {
    console.error("❌ Error saat update status deposit oleh admin:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server.",
      error: error.message,
    });
  }
});

router.post("/update-order-status", requireAdmin, async (req, res) => {
  const { userId, orderId, newStatus, newSn } = req.body;

  if (!userId || !orderId || !newStatus) {
    return res.status(400).json({
      success: false,
      message: "Parameter userId, orderId, dan newStatus wajib diisi.",
    });
  }

  try {
    const user = await User.findOne({ _id: userId, "historyOrder.id": orderId });
    if (!user) {
        return res.status(404).json({ success: false, message: "User atau transaksi order tidak ditemukan." });
    }
    
    const orderToUpdate = user.historyOrder.find(o => o.id === orderId);
    
    const updateData = {
        status: newStatus,
        sn: newSn !== undefined ? newSn : orderToUpdate.sn,
    };
    
    await editHistoryOrder(userId, orderId, updateData);

    return res.status(200).json({
      success: true,
      message: `Status order dengan ID ${orderId} berhasil diubah.`,
    });

  } catch (error) {
    console.error("❌ Error saat update status order oleh admin:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server.",
      error: error.message,
    });
  }
});

router.get('/check-order', requireAdmin, async (req, res) => {
  const { id, type = 'prabayar' } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: '❌ ID transaksi tidak boleh kosong'
    });
  }

  try {
    const response = await axios.post(
      'https://atlantich2h.com/transaksi/status',
      qs.stringify({
        api_key: ATLAN_API_KEY,
        id,
        type
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const result = response.data;

    if (!result.status || !result.data) {
      return res.status(404).json({
        success: false,
        message: '⚠️ Transaksi tidak ditemukan atau gagal'
      });
    }

    const data = result.data;
    res.json({
      success: true,
      message: 'Status transaksi berhasil diambil',
      status: data.status,
      detail: {
        id: data.id,
        reff_id: data.reff_id,
        layanan: data.layanan,
        kode: data.code,
        target: data.target,
        harga: Number(data.price),
        sn: data.sn?.trim() || null,
        waktu: data.created_at
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: '❌ Gagal memproses permintaan',
      error: error?.response?.data || error.message
    });
  }
});

router.get('/verify-user', requireAdmin, async (req, res) => {
  const { username } = req.query;
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


module.exports = router;
