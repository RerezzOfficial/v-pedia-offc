const express = require("express");
const qs = require("qs");
const cloudscraper = require("cloudscraper");
const router = express.Router();

const domain = process.env.PTERO_DOMAIN;
const apikey = process.env.PTERO_API_KEY;

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
} = require("../index.js");

const cloudscraperHeaders = {
  "Content-Type": "application/x-www-form-urlencoded",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
};

router.get("/profile", validateApiKey, async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found after API key validation",
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
        tanggalDaftar: user.tanggalDaftar,
        role: user.role,
        isVerified: user.isVerified,
        lastLogin: user.lastLogin,
        referralCode: user.referralCode,
      },
    });
  } catch (error) {
    console.error("Error fetching user profile via API:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

router.get("/mutasi", validateApiKey, async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found after API key validation",
      });
    }

    const historyDeposit = user.historyDeposit || [];
    const historyOrder = user.historyOrder || [];

    historyDeposit.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    historyOrder.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return res.status(200).json({
      success: true,
      mutasiDeposit: historyDeposit,
      mutasiOrder: historyOrder,
    });
  } catch (error) {
    console.error("Error fetching mutation history via API:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

router.get("/deposit/metode", validateApiKey, async (req, res) => {
  try {
    const formData = {
      api_key: process.env.ATLAN_API_KEY,
    };

    const response = await cloudscraper.post("https://atlantich2h.com/deposit/metode", {
      body: qs.stringify(formData),
      headers: cloudscraperHeaders,
    });

    const result = JSON.parse(response);

    if (!result.status || !Array.isArray(result.data)) {
      return res.status(502).json({
        success: false,
        message: "Respon dari server utama tidak valid.",
      });
    }

    const role = req.user?.role || "user";
    let tambahanPersen = 0;
    if (role === "user") tambahanPersen = 0.2;
    if (role === "reseller") tambahanPersen = 0.1;

    const blacklist = ["OVO", "QRIS", "DANA", "ovo", "MANDIRI", "PERMATA"];

    const metodeFormatted = result.data
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
      message: "Daftar metode deposit V-Pedia",
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

router.get("/deposit/create", validateApiKey, async (req, res) => {
  const {
    user
  } = req;
  const {
    nominal,
    metode: metodePilihanPengguna
  } = req.query;

  if (!nominal || isNaN(nominal)) {
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
      const metodeResponse = await cloudscraper.post(`${BASE_URL}/deposit/metode`, {
        body: qs.stringify({
          api_key: process.env.ATLAN_API_KEY
        }),
        headers: cloudscraperHeaders,
      });

      const parsedMetode = JSON.parse(metodeResponse);
      const allMetode = parsedMetode?.data || [];

      const foundMetode = allMetode.find(
        (m) =>
        m.metode?.toUpperCase() === metodePilihanPengguna.toUpperCase() &&
        (m.status?.toLowerCase() === "aktif" || m.status?.toLowerCase() === "on")
      );

      if (!foundMetode) {
        return res.status(400).json({
          success: false,
          message: `Metode '${metodePilihanPengguna}' tidak ditemukan atau tidak aktif.`,
        });
      }

      selectedMetodeCode = foundMetode.metode;
      selectedMetodeType = foundMetode.type;
      minDepositForMetode = parseInt(foundMetode.min) || 0;
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
  const formData = {
    api_key: process.env.ATLAN_API_KEY,
    reff_id,
    nominal: parsedNominal,
    type: selectedMetodeType,
    metode: selectedMetodeCode,
  };

  try {
    const depositResponse = await cloudscraper.post(`${BASE_URL}/deposit/create`, {
      body: qs.stringify(formData),
      headers: cloudscraperHeaders,
    });

    const result = JSON.parse(depositResponse);
    if (!result?.status || !result?.data) {
      return res.status(502).json({
        success: false,
        message: result?.message || "Gagal membuat deposit.",
        error: result?.data || result,
      });
    }

    const d = result.data;
    const originalFee = parseInt(d.fee) || 0;
    const originalGetBalance = parseInt(d.get_balance) || 0;

    let additionalFee = 0;
    if (user.role === "user") {
      additionalFee = Math.ceil(originalGetBalance * 0.002);
    } else if (user.role === "reseller") {
      additionalFee = Math.ceil(originalGetBalance * 0.001);
    }

    const totalFee = originalFee + additionalFee;
    const finalBalance = originalGetBalance - additionalFee;

    const history = {
      id: d.id,
      reff_id: d.reff_id,
      nominal: parseInt(d.nominal) || 0,
      tambahan: parseInt(d.tambahan) || 0,
      fee: totalFee,
      get_balance: finalBalance,
      metode: selectedMetodeCode,
      bank: d.bank || null,
      tujuan: d.tujuan || d.nomor_va || null,
      atas_nama: d.atas_nama || null,
      status: d.status,
      qr_image: d.qr_image || d.url || null,
      created_at: d.created_at ? new Date(d.created_at) : new Date(),
    };

    await tambahHistoryDeposit(user._id, history);

    res.status(200).json({
      success: true,
      data: {
        ...d,
        fee: totalFee,
        get_balance: finalBalance,
      },
    });

    const intervalId = setInterval(async () => {
      try {
        const statusRes = await cloudscraper.post(`${BASE_URL}/deposit/status`, {
          body: qs.stringify({
            api_key: process.env.ATLAN_API_KEY,
            id: d.id,
          }),
          headers: cloudscraperHeaders,
        });

        const statusData = JSON.parse(statusRes);
        if (statusData?.status && statusData?.data) {
          const currStatus = statusData.data.status;
          const currBalance = parseInt(statusData.data.get_balance) || 0;

          const userCheck = await User.findOne({
            _id: user._id,
            "historyDeposit.id": d.id
          }, {
            "historyDeposit.$": 1,
            saldo: 1
          });
          const txInDb = userCheck?.historyDeposit?.[0];

          if (txInDb && txInDb.status !== currStatus) {
            await editHistoryDeposit(user._id, d.id, currStatus);
          }

          if (currStatus === "success" && txInDb?.status !== "success") {
            await User.findByIdAndUpdate(user._id, {
              $inc: {
                saldo: finalBalance
              },
            });
          }

          if (["success", "failed", "expired", "cancel"].includes(currStatus)) {
            clearInterval(intervalId);
          }
        }
      } catch (pollErr) {
        console.error(
          `Gagal polling status deposit ID ${d.id}:`,
          pollErr.response?.data || pollErr.message
        );
      }
    }, 1000);
  } catch (error) {
    const apiError = error.response?.data;
    res.status(500).json({
      success: false,
      message: apiError?.message || "Terjadi kesalahan saat membuat deposit.",
      error: apiError || error.message,
    });
  }
});

router.get("/deposit/status", validateApiKey, async (req, res) => {
  const {
    user
  } = req;
  const {
    id
  } = req.query;

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

    const atlanticResponse = await cloudscraper.post(`${BASE_URL}/deposit/status`, {
      body: qs.stringify(formDataToAtlantic),
      headers: cloudscraperHeaders,
    });

    const resultFromAtlantic = JSON.parse(atlanticResponse);

    if (!resultFromAtlantic || !resultFromAtlantic.status || !resultFromAtlantic.data) {
      return res.status(502).json({
        success: false,
        message: resultFromAtlantic?.data?.message ||
          resultFromAtlantic?.message ||
          "Gagal memeriksa status deposit ke provider.",
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
      message: apiError?.data?.message ||
        apiError?.message ||
        "Terjadi kesalahan internal saat memeriksa status deposit.",
      error: apiError || error.message,
    });
  }
});

router.get("/deposit/cancel", validateApiKey, async (req, res) => {
  const {
    user
  } = req;
  const {
    id
  } = req.query;

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

    const atlanticResponse = await cloudscraper.post(`${BASE_URL}/deposit/cancel`, {
      body: qs.stringify(formDataToAtlantic),
      headers: cloudscraperHeaders,
    });

    const resultFromAtlantic = JSON.parse(atlanticResponse);

    if (!resultFromAtlantic || !resultFromAtlantic.status || !resultFromAtlantic.data) {
      return res.status(502).json({
        success: false,
        message: resultFromAtlantic?.data?.message ||
          resultFromAtlantic?.message ||
          "Gagal membatalkan deposit.",
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
      message: apiError?.data?.message ||
        apiError?.message ||
        "Terjadi kesalahan internal saat membatalkan deposit.",
      error: apiError || error.message,
    });
  }
});

router.get("/layanan/price-list", validateApiKey, async (req, res) => {
  const {
    user
  } = req;
  const {
    code
  } = req.query;

  try {
    const formDataToAtlantic = {
      api_key: process.env.ATLAN_API_KEY,
      type: "prabayar",
      code: code,
    };

    const response = await cloudscraper.post(`${BASE_URL}/layanan/price_list`, {
      body: qs.stringify(formDataToAtlantic),
      headers: cloudscraperHeaders,
    });

    const responseBody = JSON.parse(response);

    if (!responseBody || !responseBody.status || !Array.isArray(responseBody.data)) {
      return res.status(502).json({
        success: false,
        message: responseBody?.message || "Gagal mendapatkan daftar harga.",
        error: responseBody?.data || responseBody,
      });
    }

    const modifiedData = responseBody.data.map((item) => {
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
    return res.status(500).json({
      success: false,
      message: error?.message || "Terjadi kesalahan internal saat memproses permintaan.",
      error: error,
    });
  }
});

router.get("/order/create", validateApiKey, async (req, res) => {
  const {
    user
  } = req;
  const {
    code,
    tujuan: target
  } = req.query;

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

    const atlanticPriceListResponse = await cloudscraper.post(
      `${BASE_URL}/layanan/price_list`, {
        body: qs.stringify(formDataToAtlanticPriceList),
        headers: cloudscraperHeaders,
      }
    );

    const priceListResult = JSON.parse(atlanticPriceListResponse);

    if (!priceListResult || !priceListResult.status || !priceListResult.data) {
      return res.status(502).json({
        success: false,
        message: priceListResult?.message || "Gagal mendapatkan daftar harga.",
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

    const atlanticCreateResponse = await cloudscraper.post(
      `${BASE_URL}/transaksi/create`, {
        body: qs.stringify(formDataToAtlanticCreate),
        headers: cloudscraperHeaders,
      }
    );

    const createResult = JSON.parse(atlanticCreateResponse);

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
        const checkStatusResponse = await cloudscraper.post(
          `${BASE_URL}/transaksi/status`, {
            body: qs.stringify({
              api_key: process.env.ATLAN_API_KEY,
              id: transactionDetails.id,
              type: "prabayar",
            }),
            headers: cloudscraperHeaders,
          }
        );

        const statusUpdateData = JSON.parse(checkStatusResponse);

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
            await User.findByIdAndUpdate(user._id, {
              $inc: {
                saldo: modifiedPrice
              },
            });
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

router.get("/order/check", validateApiKey, async (req, res) => {
  const {
    user
  } = req;
  const {
    id
  } = req.query;

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

    const checkStatusResponse = await cloudscraper.post(
      `${BASE_URL}/transaksi/status`, {
        body: qs.stringify(formDataToAtlanticStatus),
        headers: cloudscraperHeaders,
      }
    );

    const statusResult = JSON.parse(checkStatusResponse);

    if (!statusResult || !statusResult.status || !statusResult.data) {
      return res.status(502).json({
        success: false,
        message: statusResult?.message || "Gagal memeriksa status order.",
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

router.get("/order-panel", validateApiKey, async (req, res) => {
  const {
    username,
    paket
  } = req.query;
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
  let modifiedHarga = harga;
  if (user.role === "user") {
    modifiedHarga = harga + 10;
  } else if (user.role === "reseller") {
    modifiedHarga = harga + 7;
  }
  if (user.saldo < modifiedHarga) {
    await tambahHistoryOrder(user._id, {
      id: generateReffId(),
      layanan: `Panel ${paket}`,
      code: paket.toUpperCase(),
      target: username,
      price: modifiedHarga.toString(),
      status: "Gagal - Saldo tidak mencukupi",
      created_at: new Date(),
    });
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
    const reff_id = generateReffId();
    const createUserResponse = await cloudscraper.post(
      `${domain}/api/application/users`, {
        body: JSON.stringify({
          email,
          username,
          first_name: username,
          last_name: username,
          language: "en",
          password,
        }),
        headers
      }
    );
    const newUser = JSON.parse(createUserResponse).attributes;
    const createServerResponse = await cloudscraper.post(
      `${domain}/api/application/servers`, {
        body: JSON.stringify({
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
        }),
        headers
      }
    );
    const newServer = JSON.parse(createServerResponse).attributes;
    await User.findByIdAndUpdate(user._id, {
      $inc: {
        saldo: -modifiedHarga
      },
    });
    await tambahHistoryOrder(user._id, {
      id: reff_id,
      reff_id,
      layanan: `Panel ${paket}`,
      code: paket.toUpperCase(),
      target: username,
      price: modifiedHarga.toString(),
      status: "Sukses",
      created_at: new Date(),
    });
    return res.status(201).json({
      success: true,
      message: "Server berhasil dibuat",
      data: {
        id: reff_id,
        reff_id,
        layanan: `Panel ${paket}`,
        code: paket.toUpperCase(),
        target: username,
        price: modifiedHarga.toString(),
        status: "Sukses",
        created_at: new Date(),
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
    await tambahHistoryOrder(user._id, {
      id: generateReffId(),
      layanan: `Panel ${paket}`,
      code: paket.toUpperCase(),
      target: username,
      price: modifiedHarga.toString(),
      status: "Gagal - Internal server error",
      created_at: new Date(),
    });
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat membuat server",
      error: error.response?.data || error.message,
    });
  }
});

module.exports = router;
