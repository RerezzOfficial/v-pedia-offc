const express = require("express");
const qs = require("qs");
const multer = require('multer');
const cloudscraper = require("cloudscraper");
const upload = multer();
const app = express();
const router = express.Router();
app.use(express.urlencoded({
  extended: true
}));
app.use(express.json());

const domain = process.env.PTERO_DOMAIN;
const apikey = process.env.PTERO_API_KEY;

const {
  requireLogin,
  User,
  tambahHistoryDeposit,
  generateReffId,
  BASE_URL,
  ATLAN_API_KEY,
  editHistoryDeposit,
  tambahHistoryOrder,
  editHistoryOrder,
} = require("../index.js");

const cloudscraperHeaders = {
  "Content-Type": "application/x-www-form-urlencoded",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
};

async function getAtlanticDepositMethods() {
  try {
    const formData = {
      api_key: process.env.ATLAN_API_KEY,
    };
    const response = await cloudscraper.post(`${BASE_URL}/deposit/metode`, {
      body: qs.stringify(formData),
      headers: cloudscraperHeaders,
    });
    const result = JSON.parse(response);
    if (result && result.status && Array.isArray(result.data)) {
      return result.data;
    }
    return null;
  } catch (error) {
    console.error("Gagal mengambil metode deposit dari Atlantic:", error?.response?.data || error.message);
    return null;
  }
}

router.post("/deposit/metode", requireLogin, async (req, res) => {
  try {
    const atlanticMethods = await getAtlanticDepositMethods();
    if (!atlanticMethods) {
      return res.status(502).json({
        success: false,
        message: "Gagal mengambil daftar metode dari provider.",
      });
    }

    const role = req.session.role || "user";
    let tambahanPersen = 0;
    if (role === "user") tambahanPersen = 0.2;
    if (role === "reseller") tambahanPersen = 0.1;

    const blacklist = ['OVO', 'QRIS', 'DANA', 'ovo', 'MANDIRI', 'PERMATA'];

    const metodeFormatted = atlanticMethods
      .filter((item) => !blacklist.includes(item.metode?.toUpperCase()))
      .map((item) => {
        const metodeUpper = item.metode?.toUpperCase();
        const localImageMap = {
          BCA: "/media/metode/bca.png",
          BRI: "/media/metode/bri.png",
          BNI: "/media/metode/bni.png",
          SHOPEEPAY: "/media/metode/shopeepay.png",
          LINKAJA: "/media/metode/linkaja.png",
          QRISFAST: "/media/metode/qrisfast.png",
        };
        const fullUrl = `${req.protocol}://${req.get("host")}`;
        const baseFee = parseFloat(item.fee_persen) || 0;
        const adjustedFee = (baseFee + tambahanPersen).toFixed(2);
        return {
          metode: item.metode,
          type: item.type,
          name: item.name,
          min: item.min,
          max: item.max,
          fee: item.fee,
          fee_persen: adjustedFee,
          status: item.status,
          img_url: localImageMap[metodeUpper] ?
            `${fullUrl}${localImageMap[metodeUpper]}` :
            `${fullUrl}/media/metode/default.png`,
        };
      });
    return res.status(200).json({
      success: true,
      message: "Daftar metode deposit berhasil difilter",
      metode: metodeFormatted,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Gagal mengambil metode deposit",
      error: error?.response?.data || error.message,
    });
  }
});

router.post("/deposit/create", requireLogin, async (req, res) => {
  console.log("🔔 [DEPOSIT] Endpoint /deposit/create dipanggil");
  const user = await User.findById(req.session.userId);
  if (!user) {
    console.log("🚫 User tidak ditemukan atau sesi tidak valid. ID Session:", req.session.userId);
    return res.status(401).json({
      success: false,
      message: "User tidak ditemukan atau sesi tidak valid."
    });
  }
  const {
    nominal,
    metode: metodePilihanPengguna
  } = req.body;
  console.log(`📥 Permintaan deposit oleh ${user.username || user.email || user._id}`);
  console.log("🧾 Data diterima:", {
    nominal,
    metode: metodePilihanPengguna
  });
  if (!nominal || isNaN(nominal)) {
    console.log("❗ Nominal tidak valid:", nominal);
    return res.status(400).json({
      success: false,
      message: "Nominal harus diisi dan berupa angka.",
    });
  }
  const parsedNominal = parseInt(nominal);
  let selectedMetodeCode = "QRISFAST";
  let selectedMetodeType = "ewallet";
  let minDepositForMetode = 500;
  if (metodePilihanPengguna) {
    try {
      const metodeResponse = await cloudscraper.post(
        `${BASE_URL}/deposit/metode`, {
          body: qs.stringify({
            api_key: process.env.ATLAN_API_KEY
          }),
          headers: cloudscraperHeaders
        }
      );
      const allMetode = JSON.parse(metodeResponse).data || [];
      const foundMetode = allMetode.find(
        (m) =>
        m.metode?.toUpperCase() === metodePilihanPengguna.toUpperCase() &&
        (m.status?.toLowerCase() === "aktif" || m.status?.toLowerCase() === "on")
      );
      if (!foundMetode) {
        return res.status(400).json({
          success: false,
          message: `Metode pembayaran '${metodePilihanPengguna}' tidak ditemukan atau tidak aktif.`,
        });
      }
      selectedMetodeCode = foundMetode.metode;
      selectedMetodeType = foundMetode.type;
      minDepositForMetode = selectedMetodeCode.toUpperCase() === "QRISPAST" ? 500 : parseInt(foundMetode.min) || 0;
    } catch (err) {
      return res.status(502).json({
        success: false,
        message: "Gagal mengambil data metode dari provider.",
        error: err.response?.data || err.message,
      });
    }
  }
  if (parsedNominal < minDepositForMetode) {
    return res.status(400).json({
      success: false,
      message: `Nominal minimal untuk metode ${selectedMetodeCode} adalah ${minDepositForMetode}. Nominal Anda: ${parsedNominal}.`,
    });
  }
  const reff_id = generateReffId();
  const formDataToAtlantic = {
    api_key: process.env.ATLAN_API_KEY,
    reff_id,
    nominal: parsedNominal,
    type: selectedMetodeType,
    metode: selectedMetodeCode,
  };
  try {
    const atlanticResponse = await cloudscraper.post(
      `${BASE_URL}/deposit/create`, {
        body: qs.stringify(formDataToAtlantic),
        headers: cloudscraperHeaders
      }
    );
    const resultFromAtlantic = JSON.parse(atlanticResponse);
    if (!resultFromAtlantic || !resultFromAtlantic.status || !resultFromAtlantic.data) {
      return res.status(502).json({
        success: false,
        message: resultFromAtlantic?.data?.message || resultFromAtlantic?.message || "Gagal membuat permintaan deposit ke provider.",
        error: resultFromAtlantic?.data || resultFromAtlantic,
      });
    }
    const depositDetails = resultFromAtlantic.data;
    const originalFee = parseInt(depositDetails.fee) || 0;
    const originalGetBalance = parseInt(depositDetails.get_balance) || 0;
    let additionalFee = 0;
    if (user.role === "user") {
      additionalFee = Math.ceil(originalGetBalance * 0.002);
    } else if (user.role === "reseller") {
      additionalFee = Math.ceil(originalGetBalance * 0.001);
    }
    const totalFee = originalFee + additionalFee;
    const finalBalance = originalGetBalance - additionalFee;
    const historyDataForDb = {
      id: depositDetails.id,
      reff_id: depositDetails.reff_id,
      nominal: parseInt(depositDetails.nominal) || 0,
      tambahan: parseInt(depositDetails.tambahan) || 0,
      fee: totalFee,
      get_balance: finalBalance,
      metode: selectedMetodeCode,
      bank: depositDetails.bank || null,
      tujuan: depositDetails.tujuan || depositDetails.nomor_va || null,
      atas_nama: depositDetails.atas_nama || null,
      status: depositDetails.status,
      qr_image: depositDetails.qr_image || depositDetails.url || null,
      created_at: depositDetails.created_at ? new Date(depositDetails.created_at) : new Date(),
    };
    await tambahHistoryDeposit(user._id, historyDataForDb);
    res.status(200).json({
      success: true,
      data: {
        ...depositDetails,
        fee: totalFee,
        get_balance: finalBalance,
      },
    });
    const intervalId = setInterval(async () => {
      try {
        const checkStatusResponse = await cloudscraper.post(
          `${BASE_URL}/deposit/status`, {
            body: qs.stringify({
              api_key: process.env.ATLAN_API_KEY,
              id: depositDetails.id,
            }),
            headers: cloudscraperHeaders
          }
        );
        const statusUpdateData = JSON.parse(checkStatusResponse);
        if (statusUpdateData && statusUpdateData.status && statusUpdateData.data) {
          const currentTxStatus = statusUpdateData.data.status;
          const userToCheck = await User.findOne({
            _id: user._id,
            "historyDeposit.id": depositDetails.id
          }, {
            "historyDeposit.$": 1,
            saldo: 1
          });
          const txInDb = userToCheck && userToCheck.historyDeposit && userToCheck.historyDeposit.length > 0 ? userToCheck.historyDeposit[0] : null;
          if (txInDb && txInDb.status !== currentTxStatus) {
            await editHistoryDeposit(user._id, depositDetails.id, currentTxStatus);
          }
          if (currentTxStatus === "success" && txInDb && txInDb.status !== "success") {
            await User.findByIdAndUpdate(user._id, {
              $inc: {
                saldo: finalBalance
              },
            });
          }
          if (["success", "failed", "expired", "cancel"].includes(currentTxStatus)) {
            clearInterval(intervalId);
          }
        }
      } catch (pollError) {
        console.error(`Gagal cek status deposit (ID: ${depositDetails.id}):`, pollError?.response?.data || pollError.message);
      }
    }, 1000);
  } catch (error) {
    const apiError = error.response?.data;
    res.status(500).json({
      success: false,
      message: apiError?.data?.message || apiError?.message || "Terjadi kesalahan internal saat memproses deposit.",
      error: apiError || error.message,
    });
  }
});

router.post("/deposit/status", requireLogin, async (req, res) => {
  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: "User tidak ditemukan atau sesi tidak valid."
    });
  }
  const {
    id
  } = req.body;
  if (!id) {
    return res.status(400).json({
      success: false,
      message: "ID deposit harus diisi.",
    });
  }
  try {
    const userHistory = await User.findOne({
      _id: user._id,
      "historyDeposit.id": id
    }, {
      "historyDeposit.$": 1
    });
    if (!userHistory || userHistory.historyDeposit.length === 0) {
      return res.status(404).json({
        success: false,
        message: "ID deposit tidak ditemukan dalam riwayat Anda.",
      });
    }
    const formDataToAtlantic = {
      api_key: process.env.ATLAN_API_KEY,
      id,
    };
    const response = await cloudscraper.post(`${BASE_URL}/deposit/status`, {
      body: qs.stringify(formDataToAtlantic),
      headers: cloudscraperHeaders
    });
    const resultFromAtlantic = JSON.parse(response);
    if (!resultFromAtlantic || !resultFromAtlantic.status || !resultFromAtlantic.data) {
      return res.status(502).json({
        success: false,
        message: resultFromAtlantic?.data?.message || resultFromAtlantic?.message || "Gagal memeriksa status deposit ke provider.",
        error: resultFromAtlantic?.data || resultFromAtlantic,
      });
    }
    const depositDetails = resultFromAtlantic.data;
    const originalGetBalance = parseInt(depositDetails.get_balance) || 0;
    let finalBalance = originalGetBalance;
    if (user.role === "user") {
      finalBalance = Math.floor(originalGetBalance * 0.998);
    } else if (user.role === "reseller") {
      finalBalance = Math.floor(originalGetBalance * 0.999);
    }
    const responseData = {
      id: depositDetails.id,
      reff_id: depositDetails.reff_id,
      nominal: parseInt(depositDetails.nominal) || 0,
      tambahan: parseInt(depositDetails.tambahan) || 0,
      fee: parseInt(depositDetails.fee) || 0,
      get_balance: finalBalance,
      metode: depositDetails.metode,
      status: depositDetails.status,
      created_at: depositDetails.created_at,
    };
    return res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    const apiError = error.response?.data;
    return res.status(500).json({
      success: false,
      message: apiError?.data?.message || apiError?.message || "Terjadi kesalahan internal saat memeriksa status deposit.",
      error: apiError || error.message,
    });
  }
});

router.post("/deposit/cancel", requireLogin, async (req, res) => {
  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: "User tidak ditemukan atau sesi tidak valid."
    });
  }
  const {
    id
  } = req.body;
  if (!id) {
    return res.status(400).json({
      success: false,
      message: "ID deposit harus diisi.",
    });
  }
  try {
    const userHistory = await User.findOne({
      _id: user._id,
      "historyDeposit.id": id
    }, {
      "historyDeposit.$": 1
    });
    if (!userHistory || userHistory.historyDeposit.length === 0) {
      return res.status(404).json({
        success: false,
        message: "ID deposit tidak ditemukan dalam riwayat Anda.",
      });
    }
    const formDataToAtlantic = {
      api_key: process.env.ATLAN_API_KEY,
      id,
    };
    const response = await cloudscraper.post(`${BASE_URL}/deposit/cancel`, {
      body: qs.stringify(formDataToAtlantic),
      headers: cloudscraperHeaders
    });
    const resultFromAtlantic = JSON.parse(response);
    if (!resultFromAtlantic || !resultFromAtlantic.status || !resultFromAtlantic.data) {
      return res.status(502).json({
        success: false,
        message: resultFromAtlantic?.data?.message || resultFromAtlantic?.message || "Gagal membatalkan deposit ke provider.",
        error: resultFromAtlantic?.data || resultFromAtlantic,
      });
    }
    const cancelDetails = resultFromAtlantic.data;
    return res.status(200).json({
      success: true,
      data: {
        id: cancelDetails.id,
        status: cancelDetails.status,
        created_at: cancelDetails.created_at,
      },
    });
  } catch (error) {
    const apiError = error.response?.data;
    return res.status(500).json({
      success: false,
      message: apiError?.data?.message || apiError?.message || "Terjadi kesalahan internal saat membatalkan deposit.",
      error: apiError || error.message,
    });
  }
});

router.post("/layanan/price-list", requireLogin, async (req, res) => {
  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: "User tidak ditemukan atau sesi tidak valid."
    });
  }
  const {
    code
  } = req.body;
  try {
    const formDataToAtlantic = {
      api_key: process.env.ATLAN_API_KEY,
      type: 'prabayar',
      code: code,
    };
    const response = await cloudscraper.post(`${BASE_URL}/layanan/price_list`, {
      body: qs.stringify(formDataToAtlantic),
      headers: cloudscraperHeaders
    });
    const resultFromAtlantic = JSON.parse(response);
    if (!resultFromAtlantic || !resultFromAtlantic.status || !Array.isArray(resultFromAtlantic.data)) {
      return res.status(502).json({
        success: false,
        message: resultFromAtlantic?.message || "Gagal mendapatkan daftar harga dari provider.",
        error: resultFromAtlantic?.data || resultFromAtlantic,
      });
    }
    const modifiedData = resultFromAtlantic.data.map((item) => {
      let originalPrice = parseInt(item.price) || 0;
      let modifiedPrice = originalPrice;
      if (user.role === "user") {
        modifiedPrice = originalPrice + 10;
      } else if (user.role === "reseller") {
        modifiedPrice = originalPrice + 7;
      }
      return {
        code: item.code,
        name: item.name,
        category: item.category,
        type: item.type,
        provider: item.provider,
        price: modifiedPrice.toString(),
        note: item.note,
        status: item.status,
        img_url: item.img_url,
      };
    });
    return res.status(200).json({
      success: true,
      data: modifiedData,
    });
  } catch (error) {
    const apiError = error.response?.data;
    return res.status(500).json({
      success: false,
      message: apiError?.message || "Terjadi kesalahan internal saat memproses permintaan.",
      error: apiError || error.message,
    });
  }
});

router.get("/produk", requireLogin, async (req, res) => {
  const {
    category
  } = req.query;
  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.status(400).json({
      success: false,
      message: "User tidak ditemukan."
    });
  }
  try {
    const formDataToAtlantic = {
      api_key: process.env.ATLAN_API_KEY,
      type: "prabayar",
      code: "",
    };
    const response = await cloudscraper.post(`${BASE_URL}/layanan/price_list`, {
      body: qs.stringify(formDataToAtlantic),
      headers: cloudscraperHeaders,
    });
    const result = JSON.parse(response);
    const allProduk = result.data || [];
    const filtered = category ?
      allProduk.filter((item) => item.category?.toLowerCase() === category.toLowerCase()) :
      allProduk;
    const providerMap = {};
    filtered.forEach(item => {
      if (!providerMap[item.provider]) {
        providerMap[item.provider] = {
          provider: item.provider,
          img_url: item.img_url,
        };
      }
    });
    const listProvider = Object.values(providerMap);
    return res.json({
      success: true,
      data: listProvider
    });
  } catch (error) {
    const errData = error.response?.data;
    return res.status(500).json({
      success: false,
      message: errData?.message || "Gagal memproses data provider.",
      error: errData || error.message,
    });
  }
});

router.get("/produk-provider", requireLogin, async (req, res) => {
  const {
    provider
  } = req.query;
  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.status(400).json({
      success: false,
      message: "User tidak ditemukan."
    });
  }
  try {
    const formDataToAtlantic = {
      api_key: process.env.ATLAN_API_KEY,
      type: "prabayar",
      code: "",
    };
    const response = await cloudscraper.post(`${BASE_URL}/layanan/price_list`, {
      body: qs.stringify(formDataToAtlantic),
      headers: cloudscraperHeaders,
    });
    const result = JSON.parse(response);
    const allProduk = result.data || [];
    if (provider) {
      const produkByProvider = allProduk.filter(item =>
        item.provider?.toLowerCase() === provider.toLowerCase()
      );
      return res.json({
        success: true,
        data: produkByProvider
      });
    }
    const providerMap = {};
    allProduk.forEach(item => {
      if (!providerMap[item.provider]) {
        providerMap[item.provider] = {
          provider: item.provider,
          img_url: item.img_url,
        };
      }
    });
    const listProvider = Object.values(providerMap);
    return res.json({
      success: true,
      data: listProvider
    });
  } catch (error) {
    const errData = error.response?.data;
    return res.status(500).json({
      success: false,
      message: errData?.message || "Gagal memproses data produk/provider.",
      error: errData || error.message,
    });
  }
});

router.post("/order/create", requireLogin, async (req, res) => {
  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: "User tidak ditemukan atau sesi tidak valid."
    });
  }
  const {
    code,
    tujuan: target
  } = req.body;
  if (!code || !target) {
    return res.status(400).json({
      success: false,
      message: "Kode layanan dan tujuan harus diisi.",
    });
  }
  try {
    const formDataToAtlanticPriceList = {
      api_key: process.env.ATLAN_API_KEY,
      type: "prabayar",
      code: code,
    };
    const priceResponse = await cloudscraper.post(`${BASE_URL}/layanan/price_list`, {
      body: qs.stringify(formDataToAtlanticPriceList),
      headers: cloudscraperHeaders,
    });
    const priceListResult = JSON.parse(priceResponse);
    if (!priceListResult || !priceListResult.status || !priceListResult.data) {
      return res.status(502).json({
        success: false,
        message: priceListResult?.message || "Gagal mendapatkan daftar harga dari provider.",
        error: priceListResult?.data || priceListResult,
      });
    }
    const productList = Array.isArray(priceListResult.data) ? priceListResult.data : [priceListResult.data];
    const product = productList.find((item) => item.code === code && item.status === "available");
    if (!product) {
      return res.status(400).json({
        success: false,
        message: "Kode layanan tidak ditemukan atau tidak tersedia.",
      });
    }
    let originalPrice = parseInt(product.price) || 0;
    let modifiedPrice = originalPrice;
    if (user.role === "user") {
      modifiedPrice = originalPrice + 10;
    } else if (user.role === "reseller") {
      modifiedPrice = originalPrice + 7;
    }
    if (user.saldo < modifiedPrice) {
      return res.status(400).json({
        success: false,
        message: "Saldo Anda tidak mencukupi untuk melakukan transaksi ini.",
      });
    }
    const reff_id = generateReffId();
    const formDataToAtlanticCreate = {
      api_key: process.env.ATLAN_API_KEY,
      code: code,
      reff_id: reff_id,
      target: target,
      type: "prabayar",
    };
    const createResponse = await cloudscraper.post(`${BASE_URL}/transaksi/create`, {
      body: qs.stringify(formDataToAtlanticCreate),
      headers: cloudscraperHeaders,
    });
    const createResult = JSON.parse(createResponse);
    if (!createResult || !createResult.status || !createResult.data) {
      return res.status(502).json({
        success: false,
        message: createResult?.message || "Gagal membuat transaksi ke provider.",
        error: createResult?.data || createResult,
      });
    }
    const transactionDetails = createResult.data;
    await User.findByIdAndUpdate(user._id, {
      $inc: {
        saldo: -modifiedPrice
      },
    });
    const historyDataForDb = {
      id: transactionDetails.id,
      reff_id: transactionDetails.reff_id,
      layanan: transactionDetails.layanan,
      code: transactionDetails.code,
      target: transactionDetails.target,
      price: modifiedPrice.toString(),
      sn: transactionDetails.sn || null,
      status: transactionDetails.status,
      created_at: transactionDetails.created_at ?
        new Date(transactionDetails.created_at) :
        new Date(),
    };
    await tambahHistoryOrder(user._id, historyDataForDb);
    const maxPollingTime = 5 * 60 * 1000;
    const startTime = Date.now();
    const intervalId = setInterval(async () => {
      try {
        const statusResponse = await cloudscraper.post(`${BASE_URL}/transaksi/status`, {
          body: qs.stringify({
            api_key: process.env.ATLAN_API_KEY,
            id: transactionDetails.id,
            type: "prabayar",
          }),
          headers: cloudscraperHeaders,
        });
        const statusUpdateData = JSON.parse(statusResponse);
        if (statusUpdateData && statusUpdateData.status && statusUpdateData.data) {
          const currentTxStatus = statusUpdateData.data.status;
          const currentSn = statusUpdateData.data.sn || null;
          await editHistoryOrder(user._id, transactionDetails.id, {
            status: currentTxStatus,
            sn: currentSn,
          });
          if (currentTxStatus === "success") {
            clearInterval(intervalId);
          }
          if (["failed", "cancel"].includes(currentTxStatus)) {
            const orderInDb = await User.findOne({
              _id: user._id,
              "historyOrder.id": transactionDetails.id,
              "historyOrder.status": {
                $ne: "failed_refunded"
              }
            }, {
              "historyOrder.$": 1
            });
            if (orderInDb && orderInDb.historyOrder.length > 0 && orderInDb.historyOrder[0].status !== "failed_refunded") {
              await User.updateOne({
                _id: user._id,
                "historyOrder.id": transactionDetails.id
              }, {
                $inc: {
                  saldo: modifiedPrice
                },
                $set: {
                  "historyOrder.$.status": "failed_refunded"
                }
              });
            }
            clearInterval(intervalId);
          }
          if (
            ["success", "failed", "cancel"].includes(currentTxStatus) ||
            Date.now() - startTime > maxPollingTime
          ) {
            clearInterval(intervalId);
          }
        }
      } catch (pollError) {
        console.error(pollError?.response?.data || pollError.message);
      }
    }, 1000);
    return res.status(200).json({
      success: true,
      data: {
        ...transactionDetails,
        price: modifiedPrice.toString(),
      },
    });
  } catch (error) {
    const apiError = error.response?.data;
    return res.status(500).json({
      success: false,
      message: apiError?.message || "Terjadi kesalahan internal saat memproses order.",
      error: apiError || error.message,
    });
  }
});

router.post("/order/check", requireLogin, async (req, res) => {
  const user = await User.findById(req.session.userId);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: "User tidak ditemukan atau sesi tidak valid."
    });
  }
  const {
    id
  } = req.body;
  if (!id) {
    return res.status(400).json({
      success: false,
      message: "ID order harus diisi.",
    });
  }
  try {
    const userWithOrder = await User.findOne({
      _id: user._id,
      "historyOrder.id": id
    }, {
      "historyOrder.$": 1
    });
    if (!userWithOrder || !userWithOrder.historyOrder.length) {
      return res.status(404).json({
        success: false,
        message: "Order Tidak Ditemukan Di Mutasi Anda.",
      });
    }
    const formDataToAtlanticStatus = {
      api_key: process.env.ATLAN_API_KEY,
      id: id,
      type: "prabayar",
    };
    const statusResponse = await cloudscraper.post(`${BASE_URL}/transaksi/status`, {
      body: qs.stringify(formDataToAtlanticStatus),
      headers: cloudscraperHeaders,
    });
    const statusResult = JSON.parse(statusResponse);
    if (!statusResult || !statusResult.status || !statusResult.data) {
      return res.status(502).json({
        success: false,
        message: statusResult?.message || "Gagal memeriksa status order dari provider.",
        error: statusResult?.data || statusResult,
      });
    }
    const orderDetails = statusResult.data;
    return res.status(200).json({
      status: true,
      data: {
        id: orderDetails.id,
        reff_id: orderDetails.reff_id,
        layanan: orderDetails.layanan,
        code: orderDetails.code,
        target: orderDetails.target,
        price: orderDetails.price,
        sn: orderDetails.sn || null,
        status: orderDetails.status,
        created_at: orderDetails.created_at,
      },
      code: 200,
    });
  } catch (error) {
    const apiError = error.response?.data;
    return res.status(500).json({
      success: false,
      message: apiError?.message || "Terjadi kesalahan internal saat memeriksa status order.",
      error: apiError || error.message,
    });
  }
});

module.exports = router;
