const express = require("express");
const { processDailyROI } = require("../controllers/Users/roiService/roiService");
const { processAutoUpgrades } = require("../controllers/Packages/autoUpgradeService");

const router = express.Router();

/**
 * @route   GET /api/cron/roi
 * @desc    Trigger Daily ROI Payout & Auto Upgrades (Vercel Cron)
 * @access  Protected (CRON_SECRET)
 */
router.get("/roi", async (req, res) => {
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;

    console.log(`⏰ [CRON] [${new Date().toISOString()}] ROI Trigger received.`);
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        console.warn("⚠️ [CRON] Unauthorized ROI trigger attempt. Check Vercel CRON_SECRET environment variable.");
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    console.log("🚀 [CRON] Vercel Trigger: Starting Daily ROI Distribution...");
    
    const startTime = Date.now();
    try {
        const roiResult = await processDailyROI();
        console.log(`✅ [CRON] Vercel ROI Payout completed:`, roiResult);

        // Chain Auto-Upgrade check immediately after ROI on Vercel
        let autoUpgradeResult = null;
        try {
            console.log("🚀 [CRON] Vercel Trigger: Starting Auto Upgrade check after ROI...");
            autoUpgradeResult = await processAutoUpgrades();
            console.log(`✅ [CRON] Vercel Auto-Upgrade after ROI completed:`, autoUpgradeResult);
        } catch (upgError) {
            console.error(`❌ [CRON] Vercel Auto-Upgrade after ROI Error:`, upgError.message);
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        return res.status(200).json({ 
            success: true, 
            message: "ROI & Auto-Upgrade processing completed", 
            duration: `${duration}s`,
            data: {
                roi: roiResult,
                autoUpgrade: autoUpgradeResult
            }
        });
    } catch (error) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.error(`❌ [CRON] Vercel ROI Error after ${duration}s:`, error.message);
        
        return res.status(500).json({ 
            success: false, 
            message: "Internal Server Error", 
            duration: `${duration}s`, 
            error: error.message 
        });
    }
});

/**
 * @route   GET /api/cron/auto-upgrade
 * @desc    Trigger Auto Upgrade Wallet Process independently (Vercel Cron)
 * @access  Protected (CRON_SECRET)
 */
router.get("/auto-upgrade", async (req, res) => {
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;

    console.log(`⏰ [CRON] [${new Date().toISOString()}] Auto-Upgrade Trigger received.`);
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        console.warn("⚠️ [CRON] Unauthorized Auto-Upgrade trigger attempt.");
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    console.log("🚀 [CRON] Vercel Trigger: Starting Auto Upgrade Wallet Process...");
    
    const startTime = Date.now();
    try {
        const result = await processAutoUpgrades();
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log(`✅ [CRON] Vercel Auto-Upgrade completed in ${duration}s:`, result);
        
        return res.status(200).json({ 
            success: true, 
            message: "Auto-Upgrade processing completed", 
            duration: `${duration}s`,
            data: result 
        });
    } catch (error) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.error(`❌ [CRON] Vercel Auto-Upgrade Error after ${duration}s:`, error.message);
        
        return res.status(500).json({ 
            success: false, 
            message: "Internal Server Error", 
            duration: `${duration}s`, 
            error: error.message 
        });
    }
});

module.exports = router;
