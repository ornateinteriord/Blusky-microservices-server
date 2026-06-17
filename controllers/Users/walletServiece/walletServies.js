const TransactionModel = require("../../../models/Transaction/Transaction");
const MemberModel = require("../../../models/Users/Member");
const AddOnPackageModel = require("../../../models/Packages/AddOnPackage");
const CommissionModel = require("../../../models/commission.model");
const path = require("path");
const { generateOTP, storeOTP, verifyOTP } = require("../../../utils/OtpService");
const { sendMail } = require("../../../utils/EmailService");

const getWalletOverview = async (req, res) => {
  try {
    const { memberId } = req.params;
    if (!memberId) {
      return res.status(400).json({ success: false, message: "Member ID is required" });
    }

    const member = await MemberModel.findOne({ Member_id: memberId });
    if (!member) {
      return res.status(404).json({ success: false, message: "Member not found" });
    }

    const transactions = await TransactionModel.find({ member_id: memberId });

    // === TOP UP WALLET (completely separate) ===
    const topUpTransactions = transactions.filter(tx =>
      tx.transaction_type === 'Top up'
    );
    const topUpCredits = topUpTransactions
      .filter(tx => tx.status === 'Completed' || tx.status === 'Approved')
      .reduce((acc, tx) => acc + (parseFloat(tx.ew_credit) || 0), 0);
    const topUpDebits = topUpTransactions
      .filter(tx => tx.status === 'Completed' || tx.status === 'Approved')
      .reduce((acc, tx) => acc + (parseFloat(tx.ew_debit) || 0), 0);
    const topUpBalance = Math.max(0, topUpCredits - topUpDebits);

    // === NORMAL WALLET (exclude loan AND top-up transactions) ===
    const nonLoanTransactions = transactions.filter(tx =>
      !tx.transaction_type?.toLowerCase().includes('loan') &&
      !tx.description?.toLowerCase().includes('loan') &&
      tx.transaction_type !== 'Top up'
    );

    const completedAndPendingTx = nonLoanTransactions.filter(tx =>
      tx.status === "Completed" || tx.status === "Pending" || tx.status === "Approved"
    );

    const availableBalance = completedAndPendingTx.reduce((acc, tx) =>
      acc + (parseFloat(tx.ew_credit) || 0) - (parseFloat(tx.ew_debit) || 0), 0
    );

    // For display purposes only - total income/expenses from completed transactions
    const completedTx = nonLoanTransactions.filter(tx => tx.status === "Completed");
    const totalIncome = completedTx.reduce((acc, tx) => acc + (parseFloat(tx.ew_credit) || 0), 0);
    const totalExpenses = completedTx.reduce((acc, tx) => acc + (parseFloat(tx.ew_debit) || 0), 0);

    const totalWithdrawal = nonLoanTransactions
      .filter(tx => tx.transaction_type === "Withdrawal" && tx.status === "Completed")
      .reduce((acc, tx) => acc + (parseFloat(tx.ew_debit) || 0), 0);

    const otherDebits = nonLoanTransactions
      .filter(tx => tx.transaction_type !== "Withdrawal" && tx.status === "Completed")
      .reduce((acc, tx) => acc + (parseFloat(tx.ew_debit) || 0), 0);

    const levelBenefits = nonLoanTransactions
      .filter(tx => {
        const txType = tx.transaction_type?.toLowerCase() || "";
        const desc = tx.description?.toLowerCase() || "";
        return (txType.includes("level benefit") || txType.includes("level bonus") || tx.benefit_type?.toLowerCase().includes("level income")) &&
               !txType.includes("roi") && !desc.includes("roi") &&
               !txType.includes("referral") && !desc.includes("referral") &&
               tx.status === "Completed";
      })
      .reduce((acc, tx) => acc + (parseFloat(tx.ew_credit) || 0) + (parseFloat(tx.uw_credit) || 0), 0);

    const roiLevelBenefits = nonLoanTransactions
      .filter(tx => 
        tx.transaction_type === "ROI Level Benefit" &&
        tx.status === "Completed"
      )
      .reduce((acc, tx) => acc + (parseFloat(tx.ew_credit) || 0) + (parseFloat(tx.uw_credit) || 0), 0);

    const directBenefits = nonLoanTransactions
      .filter(tx => {
        const txType = tx.transaction_type?.toLowerCase() || "";
        const desc = tx.description?.toLowerCase() || "";
        return (txType === "direct benefits" || desc === "direct benefits" || 
                txType.includes("referral") || desc.includes("referral")) &&
               tx.status === "Completed";
      })
      .reduce((acc, tx) => acc + (parseFloat(tx.ew_credit) || 0) + (parseFloat(tx.uw_credit) || 0), 0);

    // Repayment Commission calculation
    const repaymentCommission = nonLoanTransactions
      .filter(tx =>
        (tx.transaction_type === "Repayment Commission" ||
          tx.description === "Repayment Commission" ||
          tx.transaction_type === "Repayment commission" ||
          tx.description === "Repayment commission") &&
        tx.status === "Completed"
      )
      .reduce((acc, tx) => acc + (parseFloat(tx.ew_credit) || 0), 0);

    // Get pending withdrawals for transparency
    const pendingWithdrawals = nonLoanTransactions
      .filter(tx => tx.transaction_type === "Withdrawal" && tx.status === "Pending")
      .reduce((acc, tx) => acc + (parseFloat(tx.ew_debit) || 0), 0);

    const roiBenefits = nonLoanTransactions
      .filter(tx =>
        tx.transaction_type === "ROI Payout" &&
        tx.status === "Completed"
      )
      .reduce((acc, tx) => acc + (parseFloat(tx.ew_credit) || 0) + (parseFloat(tx.uw_credit) || 0), 0);

    const singleLineIncome = nonLoanTransactions
      .filter(tx =>
        (tx.transaction_type === "Single Line Income" || tx.transaction_type === "Single Level Income" || tx.transaction_type === "Single Leg Income") &&
        tx.status === "Completed"
      )
      .reduce((acc, tx) => acc + (parseFloat(tx.gross_amount) || parseFloat(tx.net_amount) || parseFloat(tx.ew_credit) || 0), 0);

    const globalIncome = nonLoanTransactions
      .filter(tx =>
        tx.transaction_type === "Global Income" &&
        tx.status === "Completed"
      )
      .reduce((acc, tx) => acc + (parseFloat(tx.gross_amount) || parseFloat(tx.net_amount) || parseFloat(tx.ew_credit) || 0), 0);


    // Calculate loan amounts separately (for information only)
    const loanTransactions = transactions.filter(tx =>
      tx.transaction_type?.toLowerCase().includes('loan') ||
      tx.description?.toLowerCase().includes('loan')
    );

    const totalLoanCredits = loanTransactions.reduce((acc, tx) => acc + (parseFloat(tx.ew_credit) || 0), 0);
    const totalLoanDebits = loanTransactions.reduce((acc, tx) => acc + (parseFloat(tx.ew_debit) || 0), 0);
    const netLoanBalance = totalLoanCredits - totalLoanDebits;

    const addonPackages = await AddOnPackageModel.find({ member_id: memberId, request_id: { $ne: 'PRIMARY' } });
    const totalAddonAmount = addonPackages.reduce((acc, pkg) => acc + (pkg.amount || 0), 0);

    const singleLevelIncomeByPackage = {};
    const sliTransactions = transactions.filter(tx =>
      (tx.transaction_type === "Single Line Income" || tx.transaction_type === "Single Level Income" || tx.transaction_type === "Single Leg Income") &&
      tx.status === "Completed"
    );
    
    sliTransactions.forEach(tx => {
      // Extract amount from description e.g., "Single Leg Income ($30) from U000002"
      const match = tx.description?.match(/\(\$([\d.]+)\)/);
      if (match && match[1]) {
        const pkgVal = parseFloat(match[1]);
        if (!singleLevelIncomeByPackage[pkgVal]) {
          singleLevelIncomeByPackage[pkgVal] = 0;
        }
        singleLevelIncomeByPackage[pkgVal] += (parseFloat(tx.gross_amount) || parseFloat(tx.net_amount) || parseFloat(tx.ew_credit) || 0);
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        balance: Math.max(0, availableBalance).toFixed(2),
        totalIncome: totalIncome.toFixed(2),
        totalExpenses: totalExpenses.toFixed(2),
        totalWithdrawal: totalWithdrawal.toFixed(2),
        otherDebits: otherDebits.toFixed(2),
        transactionsCount: nonLoanTransactions.length,
        availableForWithdrawal: Math.max(0, availableBalance).toFixed(2),
        levelBenefits: levelBenefits.toFixed(2),
        roiBenefits: roiBenefits.toFixed(2),
        roiLevelBenefits: roiLevelBenefits.toFixed(2),
        directBenefits: directBenefits.toFixed(2),
        repaymentCommission: repaymentCommission.toFixed(2),
        singleLineIncome: singleLineIncome.toFixed(2),
        globalIncome: globalIncome.toFixed(2),
        singleLevelIncomeByPackage: singleLevelIncomeByPackage,
        totalAddonAmount: totalAddonAmount.toFixed(2),
        totalBenefits: (levelBenefits + roiLevelBenefits + directBenefits + repaymentCommission + roiBenefits + singleLineIncome + globalIncome).toFixed(2),
        pendingWithdrawals: pendingWithdrawals.toFixed(2),
        primaryPackage: member.package_value || 0,
        addOnPackages: totalAddonAmount,
        totalPackages: (member.package_value || 0) + totalAddonAmount,
        // Upgrade Wallet
        upgradeWalletBalance: (member.upgrade_wallet || 0).toFixed(2),
        // Top Up Wallet (completely separate)
        topUpBalance: topUpBalance.toFixed(2),
        topUpTransactions: topUpTransactions.sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date)),
        // Loan information (for transparency)
        loanInfo: {
          totalLoanAmount: totalLoanCredits.toFixed(2),
          totalLoanRepaid: totalLoanDebits.toFixed(2),
          outstandingLoan: Math.max(0, netLoanBalance).toFixed(2),
          loanTransactionsCount: loanTransactions.length
        },
        transactions: nonLoanTransactions.sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date)),
        calculation: {
          formula: "Available Balance = Sum of All Credits - Sum of All Debits (excluding loan and top-up transactions)",
          breakdown: `$${completedAndPendingTx.reduce((acc, tx) => acc + (parseFloat(tx.ew_credit) || 0), 0).toFixed(2)} - $${completedAndPendingTx.reduce((acc, tx) => acc + (parseFloat(tx.ew_debit) || 0), 0).toFixed(2)} = $${Math.max(0, availableBalance).toFixed(2)}`,
          note: "Available balance excludes loan and top-up transactions. Pending withdrawals: $" + pendingWithdrawals.toFixed(2)
        },
      },
    });
  } catch (error) {
    console.error("Error in getWalletOverview:", error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

const getWalletWithdraw = async (req, res) => {
  try {
    const { memberId, amount, otp } = req.body;

    if (!memberId) return res.status(400).json({ success: false, message: "Member ID is required" });
    if (!amount) return res.status(400).json({ success: false, message: "Withdrawal amount is required" });
    if (!otp) return res.status(400).json({ success: false, message: "OTP is required" });

    const withdrawalAmount = parseFloat(amount);
    if (isNaN(withdrawalAmount) || withdrawalAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid withdrawal amount" });
    }

    const member = await MemberModel.findOne({ Member_id: memberId });
    if (!member) return res.status(404).json({ success: false, message: "Member not found" });

    if (!verifyOTP(member.email, otp)) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    // Calculate last Saturday
    const today = new Date();
    const lastSaturday = new Date(today);

    const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday
    // Correct calculation: go back to previous Saturday
    const daysSinceSaturday = dayOfWeek === 6 ? 0 : dayOfWeek + 1;

    lastSaturday.setDate(today.getDate() - daysSinceSaturday);
    lastSaturday.setHours(0, 0, 0, 0);

    console.log("dayOfweek:", dayOfWeek);
    console.log("daysSinceSaturday:", daysSinceSaturday);
    console.log("lastSaturday:", lastSaturday.toISOString());

    // Check if member has any ACTIVE LOAN (Approved with net_amount > 0)
    const activeLoan = await TransactionModel.findOne({
      member_id: memberId,
      transaction_type: { $regex: /loan/i },
      status: "Approved",
      net_amount: { $gt: "0" } // Loan is still unpaid
    });

    console.log("Active Loan Found:", !!activeLoan);
    if (activeLoan) {
      console.log("Active Loan Details:", {
        transaction_date: activeLoan.transaction_date,
        net_amount: activeLoan.net_amount,
        transaction_type: activeLoan.transaction_type
      });
    }

    // Check if loan was taken BEFORE last Saturday
    // New rule: if an active loan exists (net_amount > 0) AND the loan origination date is before lastSaturday
    // then block withdrawal UNLESS there was a repayment on or after lastSaturday.
    let hasUnpaidLoan = false;
    let lastRepayment = null;
    if (activeLoan) {
      const loanDate = new Date(activeLoan.transaction_date);
      console.log("Loan Date:", loanDate.toISOString());
      console.log("Last Saturday:", lastSaturday.toISOString());

      // Find the latest repayment (if any)
      lastRepayment = await TransactionModel.findOne({
        member_id: memberId,
        transaction_type: { $regex: /repay|repayment|loan repayment/i },
        status: { $in: ["Paid", "Completed", "Approved"] }
      }).sort({ transaction_date: -1 }).exec();

      if (lastRepayment) {
        console.log("Last repayment found:", lastRepayment.transaction_date);
      }

      const unpaidNumeric = parseFloat(activeLoan.net_amount || "0") || 0;

      // Block only if loan was taken before lastSaturday AND there was no repayment on/after lastSaturday AND unpaid amount > 0
      const repaidOnOrAfterLastSaturday = lastRepayment && (new Date(lastRepayment.transaction_date) >= lastSaturday);
      hasUnpaidLoan = loanDate < lastSaturday && unpaidNumeric > 0 && !repaidOnOrAfterLastSaturday;
      console.log("Loan taken before last Saturday:", loanDate < lastSaturday, "unpaidNumeric:", unpaidNumeric, "repaidOnOrAfterLastSaturday:", repaidOnOrAfterLastSaturday, "hasUnpaidLoan:", hasUnpaidLoan);
    }

    const allTransactions = await TransactionModel.find({ member_id: memberId });

    const nonLoanTransactions = allTransactions.filter(tx =>
      !tx.transaction_type?.toLowerCase().includes('loan') &&
      !tx.description?.toLowerCase().includes('loan') &&
      tx.transaction_type !== 'Top up'
    );

    let totalCredits = 0;
    let totalDebits = 0;

    nonLoanTransactions.forEach((tx) => {
      totalCredits += parseFloat(tx.ew_credit) || 0;
      totalDebits += parseFloat(tx.ew_debit) || 0;
    });

    let availableBalance = totalCredits - totalDebits;
    availableBalance = Math.max(0, availableBalance);

    const completedTransactions = nonLoanTransactions.filter(tx => tx.status === "Completed");

    const levelBenefits = completedTransactions
      .filter(tx =>
        (tx.transaction_type === "Level benefits" ||
        tx.description === "Level benefits" ||
        tx.transaction_type === "Level Benefits" ||
        tx.description === "Level Benefits") && Number(tx.level) !== 1
      )
      .reduce((acc, tx) => acc + (parseFloat(tx.ew_credit) || 0) + (parseFloat(tx.uw_credit) || 0), 0);

    const directBenefits = completedTransactions
      .filter(tx =>
        tx.transaction_type === "Direct Benefits" ||
        tx.description === "Direct Benefits" ||
        tx.transaction_type === "Direct benefits" ||
        tx.description === "Direct benefits" ||
        (tx.transaction_type?.toLowerCase().includes("level benefit") && Number(tx.level) === 1)
      )
      .reduce((acc, tx) => acc + (parseFloat(tx.ew_credit) || 0) + (parseFloat(tx.uw_credit) || 0), 0);
    const repaymentCommission = completedTransactions
      .filter(tx =>
        tx.transaction_type === "Repayment Commission" ||
        tx.description === "Repayment Commission" ||
        tx.transaction_type === "Repayment commission" ||
        tx.description === "Repayment commission"
      )
      .reduce((acc, tx) => acc + (parseFloat(tx.ew_credit) || 0) + (parseFloat(tx.uw_credit) || 0), 0);

    const roiBenefits = completedTransactions
      .filter(tx =>
        tx.transaction_type === "ROI Payout"
      )
      .reduce((acc, tx) => acc + (parseFloat(tx.ew_credit) || 0) + (parseFloat(tx.uw_credit) || 0), 0);



    if (withdrawalAmount < 5) {
      return res.status(400).json({
        success: false,
        message: "Minimum withdrawal amount is $5",
        minimum: 5,
        loanStatus: {
          hasUnpaidLoan: hasUnpaidLoan,
          isWithdrawalAllowed: !hasUnpaidLoan,
          message: hasUnpaidLoan ? "Withdrawal blocked - Unpaid loan from before last Saturday" : "No unpaid loans"
        }
      });
    }

    // Max limit check removed as per user request

    // Check if member has unpaid loan from before last Saturday
    if (hasUnpaidLoan) {
      return res.status(400).json({
        success: false,
        message: "Withdrawal not allowed - You have unpaid loan amount from before last Saturday",
        loanStatus: {
          hasUnpaidLoan: true,
          isWithdrawalAllowed: false,
          lastSaturday: lastSaturday.toDateString(),
          loanDate: activeLoan?.transaction_date,
          unpaidAmount: activeLoan?.net_amount,
          message: "Please clear your pending loan amount to enable withdrawals"
        },
        details: {
          requested: withdrawalAmount.toFixed(2),
          available: availableBalance.toFixed(2),
        }
      });
    }

    if (withdrawalAmount > availableBalance) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance",
        loanStatus: {
          hasUnpaidLoan: hasUnpaidLoan,
          isWithdrawalAllowed: !hasUnpaidLoan,
          message: hasUnpaidLoan ? "Withdrawal blocked - Unpaid loan from before last Saturday" : "No unpaid loans - Withdrawal allowed if balance is sufficient"
        },
        details: {
          requested: withdrawalAmount.toFixed(2),
          available: availableBalance.toFixed(2),
          shortfall: (withdrawalAmount - availableBalance).toFixed(2),
        },
        benefitsBreakdown: {
          levelBenefits: levelBenefits.toFixed(2),
          directBenefits: directBenefits.toFixed(2),
          repaymentCommission: repaymentCommission.toFixed(2),
          roiBenefits: roiBenefits.toFixed(2),
          totalBenefits: (levelBenefits + directBenefits + repaymentCommission + roiBenefits).toFixed(2),
          availableBalance: availableBalance.toFixed(2)
        },
        note: "Loan amounts are not included in available balance for withdrawals."
      });
    }

    const deduction = withdrawalAmount * 0.05;
    const netAmount = withdrawalAmount - deduction;

    const lastTransaction = await TransactionModel.findOne({})
      .sort({ createdAt: -1 })
      .exec();

    let newTransactionId = 1;
    if (lastTransaction && lastTransaction.transaction_id) {
      const lastIdNumber = parseInt(lastTransaction.transaction_id.replace(/\D/g, ""), 10) || 0;
      newTransactionId = lastIdNumber + 1;
    }

    const newTransaction = new TransactionModel({
      transaction_id: newTransactionId.toString(),
      transaction_date: new Date(),
      member_id: memberId,
      description: "Withdrawal Request",
      transaction_type: "Withdrawal",
      ew_credit: 0,
      ew_debit: withdrawalAmount,
      status: "Pending",
      deduction: deduction,
      net_amount: netAmount,
      gross_amount: withdrawalAmount,
      benefits_source: {
        level_benefits_used: levelBenefits,
        direct_benefits_used: directBenefits,
        repayment_commission_used: repaymentCommission,
        roi_benefits_used: roiBenefits,
        total_benefits_available: levelBenefits + directBenefits + repaymentCommission + roiBenefits
      }
    });

    await newTransaction.save();

    // Deduct from member's wallet_balance field (sync with Available Balance)
    await MemberModel.findOneAndUpdate(
      { Member_id: memberId },
      { $inc: { wallet_balance: -withdrawalAmount } }
    );

    let newAvailableBalance = availableBalance - withdrawalAmount;
    newAvailableBalance = Math.max(0, newAvailableBalance);

    return res.status(200).json({
      success: true,
      message: "Withdrawal request submitted successfully",
      data: {
        transactionId: newTransaction.transaction_id,
        withdrawalDetails: {
          grossAmount: withdrawalAmount.toFixed(2),
          deduction: deduction.toFixed(2),
          netAmount: netAmount.toFixed(2),
          deductionRate: "5%"
        },
        balanceDetails: {
          previousBalance: availableBalance.toFixed(2),
          withdrawalAmount: withdrawalAmount.toFixed(2),
          newAvailableBalance: newAvailableBalance.toFixed(2)
        },
        benefitsBreakdown: {
          levelBenefits: levelBenefits.toFixed(2),
          directBenefits: directBenefits.toFixed(2),
          repaymentCommission: repaymentCommission.toFixed(2),
          roiBenefits: roiBenefits.toFixed(2),
          totalBenefits: (levelBenefits + directBenefits + repaymentCommission + roiBenefits).toFixed(2),
          benefitsContribution: `${((levelBenefits + directBenefits + repaymentCommission + roiBenefits) / (totalCredits || 1) * 100).toFixed(1)}% of total income`
        },
        loanStatus: {
          hasUnpaidLoan: false,
          isWithdrawalAllowed: true,
          message: "No unpaid loans - Withdrawal processed successfully"
        },
        status: "Pending",
        calculation: {
          deduction: `5% of $${withdrawalAmount.toFixed(2)} = $${deduction.toFixed(2)}`,
          netAmount: `$${withdrawalAmount.toFixed(2)} - $${deduction.toFixed(2)} = $${netAmount.toFixed(2)}`,
          balanceUpdate: `$${availableBalance.toFixed(2)} - $${withdrawalAmount.toFixed(2)} = $${newAvailableBalance.toFixed(2)}`
        },
        note: "Your available balance excludes loan transactions and includes this pending withdrawal."
      },
    });
  } catch (error) {
    console.error("Error in getWalletWithdraw:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};


const sendWithdrawalOTP = async (req, res) => {
  try {
    const { memberId, amount } = req.body;

    if (!memberId) return res.status(400).json({ success: false, message: "Member ID is required" });
    if (!amount) return res.status(400).json({ success: false, message: "Withdrawal amount is required" });

    const withdrawalAmount = parseFloat(amount);
    if (isNaN(withdrawalAmount) || withdrawalAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid withdrawal amount" });
    }

    const member = await MemberModel.findOne({ Member_id: memberId });
    if (!member) return res.status(404).json({ success: false, message: "Member not found" });

    // Loan and balance logic
    const today = new Date();
    const lastSaturday = new Date(today);
    const dayOfWeek = today.getDay();
    const daysSinceSaturday = dayOfWeek === 6 ? 0 : dayOfWeek + 1;
    lastSaturday.setDate(today.getDate() - daysSinceSaturday);
    lastSaturday.setHours(0, 0, 0, 0);

    const activeLoan = await TransactionModel.findOne({
      member_id: memberId,
      transaction_type: { $regex: /loan/i },
      status: "Approved",
      net_amount: { $gt: "0" }
    });

    let hasUnpaidLoan = false;
    let lastRepayment = null;
    if (activeLoan) {
      const loanDate = new Date(activeLoan.transaction_date);
      lastRepayment = await TransactionModel.findOne({
        member_id: memberId,
        transaction_type: { $regex: /repay|repayment|loan repayment/i },
        status: { $in: ["Paid", "Completed", "Approved"] }
      }).sort({ transaction_date: -1 }).exec();

      const unpaidNumeric = parseFloat(activeLoan.net_amount || "0") || 0;
      const repaidOnOrAfterLastSaturday = lastRepayment && (new Date(lastRepayment.transaction_date) >= lastSaturday);
      hasUnpaidLoan = loanDate < lastSaturday && unpaidNumeric > 0 && !repaidOnOrAfterLastSaturday;
    }

    const allTransactions = await TransactionModel.find({ member_id: memberId });
    const nonLoanTransactions = allTransactions.filter(tx =>
      !tx.transaction_type?.toLowerCase().includes('loan') &&
      !tx.description?.toLowerCase().includes('loan') &&
      tx.transaction_type !== 'Top up'
    );

    let totalCredits = 0;
    let totalDebits = 0;
    nonLoanTransactions.forEach((tx) => {
      totalCredits += parseFloat(tx.ew_credit) || 0;
      totalDebits += parseFloat(tx.ew_debit) || 0;
    });

    let availableBalance = Math.max(0, totalCredits - totalDebits);

    if (withdrawalAmount < 5) {
      return res.status(400).json({ success: false, message: "Minimum withdrawal amount is $5" });
    }

    if (hasUnpaidLoan) {
      return res.status(400).json({ success: false, message: "Withdrawal not allowed - You have unpaid loan amount from before last Saturday" });
    }

    if (withdrawalAmount > availableBalance) {
      return res.status(400).json({ success: false, message: "Insufficient balance" });
    }

    // Generate and send OTP
    const otp = generateOTP();
    storeOTP(member.email, otp);

    const bmsLogoPath = path.join(__dirname, '..', '..', '..', 'utils', 'USDT.png');
    const attachments = [{
      filename: 'USDT.png',
      path: bmsLogoPath,
      cid: 'bmslogo'
    }];

    const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #111827; border-radius: 12px; border: 1px solid #374151;">
      <div style="text-align: center; margin-bottom: 0px;">
        <img src="cid:bmslogo" alt="USDT World Club Logo" style="max-width: 120px; height: auto;" />
      </div>
      <div style="background-color: #1f2937; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);">
        <h2 style="color: #ffffff; margin-top: 0; text-align: center; font-size: 24px;">Withdrawal Verification</h2>
        <p style="color: #d1d5db; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
          Dear <strong style="color: #fbbf24;">${member.Name || 'Member'}</strong>,
        </p>
        <p style="color: #ffffff; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">
          You have requested to withdraw <strong>$${withdrawalAmount.toFixed(2)}</strong> from your wallet. 
          Please use the following OTP to authorize and complete this transaction:
        </p>
        <div style="background-color: #374151; border-left: 4px solid #fbbf24; padding: 20px; margin: 25px 0; border-radius: 4px; text-align: center;">
          <h1 style="color: #fbbf24; margin: 0; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
        </div>
        <p style="color: #9ca3af; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
          This OTP is valid for 3 minutes. If you did not request this withdrawal, please secure your account immediately.
        </p>
      </div>
      <div style="text-align: center; margin-top: 25px; color: #9ca3af; font-size: 12px;">
        &copy; ${new Date().getFullYear()} USDT World Club. All rights reserved.
      </div>
    </div>`;

    await sendMail(member.email, "USDT World Club - Withdrawal Verification OTP", htmlContent, `Your OTP is ${otp}`, attachments);

    return res.status(200).json({ success: true, message: "OTP sent to your registered email" });
  } catch (error) {
    console.error("Error in sendWithdrawalOTP:", error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};const sendTransferOTP = async (req, res) => {
  try {
    const { memberId, fromWallet, toWallet, amount } = req.body;

    if (!memberId || !fromWallet || !toWallet || !amount) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const transferAmount = parseFloat(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid transfer amount" });
    }

    if (fromWallet === "Earnings" && toWallet !== "Top Up Wallet") {
       return res.status(400).json({ success: false, message: "Earnings can only be transferred to Top Up Wallet" });
    }
    if (fromWallet === "Top Up" && toWallet !== "Upgrade Wallet") {
       return res.status(400).json({ success: false, message: "Top Up can only be transferred to Upgrade Wallet" });
    }

    const member = await MemberModel.findOne({ Member_id: memberId });
    if (!member) {
      return res.status(404).json({ success: false, message: "Member not found" });
    }

    let currentBalance = 0;
    if (fromWallet === "Earnings") {
       currentBalance = member.wallet_balance || 0;
    } else if (fromWallet === "Top Up") {
       const transactions = await TransactionModel.find({ member_id: memberId });
       const topUpTransactions = transactions.filter(tx => tx.transaction_type === 'Top up');
       const topUpCredits = topUpTransactions
         .filter(tx => tx.status === 'Completed' || tx.status === 'Approved')
         .reduce((acc, tx) => acc + (parseFloat(tx.ew_credit) || 0), 0);
       const topUpDebits = topUpTransactions
         .filter(tx => tx.status === 'Completed' || tx.status === 'Approved')
         .reduce((acc, tx) => acc + (parseFloat(tx.ew_debit) || 0), 0);
       currentBalance = Math.max(0, topUpCredits - topUpDebits);
    } else {
       return res.status(400).json({ success: false, message: "Invalid source wallet" });
    }

    if (transferAmount > currentBalance) {
      return res.status(400).json({ success: false, message: "Insufficient balance in " + fromWallet });
    }

    // Generate and send OTP
    const otp = generateOTP();
    storeOTP(member.email, otp);

    const bmsLogoPath = path.join(__dirname, '..', '..', '..', 'utils', 'USDT.png');
    const attachments = [{
      filename: 'USDT.png',
      path: bmsLogoPath,
      cid: 'bmslogo'
    }];

    const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #111827; border-radius: 12px; border: 1px solid #374151;">
      <div style="text-align: center; margin-bottom: 0px;">
        <img src="cid:bmslogo" alt="USDT World Club Logo" style="max-width: 120px; height: auto;" />
      </div>
      <div style="background-color: #1f2937; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);">
        <h2 style="color: #ffffff; margin-top: 0; text-align: center; font-size: 24px;">Transfer Verification</h2>
        <p style="color: #d1d5db; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
          Dear <strong style="color: #fbbf24;">${member.Name || 'Member'}</strong>,
        </p>
        <p style="color: #ffffff; font-size: 16px; line-height: 1.6; margin-bottom: 25px;">
          You have requested to transfer <strong>$${transferAmount}</strong> from your <strong>${fromWallet}</strong> to <strong>${toWallet}</strong>. 
          Please use the following OTP to complete this transaction:
        </p>
        <div style="background-color: #374151; border-left: 4px solid #fbbf24; padding: 20px; margin: 25px 0; border-radius: 4px; text-align: center;">
          <h1 style="color: #fbbf24; margin: 0; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
        </div>
        <p style="color: #9ca3af; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
          This OTP is valid for 3 minutes. If you did not request this transfer, please secure your account immediately.
        </p>
      </div>
      <div style="text-align: center; margin-top: 25px; color: #9ca3af; font-size: 12px;">
        &copy; ${new Date().getFullYear()} USDT World Club. All rights reserved.
      </div>
    </div>`;

    await sendMail(member.email, "USDT World Club - Transfer Verification OTP", htmlContent, `Your OTP is ${otp}`, attachments);

    return res.status(200).json({ success: true, message: "OTP sent to your registered email" });
  } catch (error) {
    console.error("Error in sendTransferOTP:", error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};const transferWallet = async (req, res) => {
  try {
    const { memberId, fromWallet, toWallet, amount, otp } = req.body;

    if (!memberId || !fromWallet || !toWallet || !amount || !otp) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const transferAmount = parseFloat(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid transfer amount" });
    }

    if (fromWallet === "Earnings" && toWallet !== "Top Up Wallet") {
       return res.status(400).json({ success: false, message: "Earnings can only be transferred to Top Up Wallet" });
    }
    if (fromWallet === "Top Up" && toWallet !== "Upgrade Wallet") {
       return res.status(400).json({ success: false, message: "Top Up can only be transferred to Upgrade Wallet" });
    }

    const member = await MemberModel.findOne({ Member_id: memberId });
    if (!member) {
      return res.status(404).json({ success: false, message: "Member not found" });
    }

    if (!verifyOTP(member.email, otp)) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    let currentBalance = 0;
    if (fromWallet === "Earnings") {
       currentBalance = member.wallet_balance || 0;
    } else if (fromWallet === "Top Up") {
       const transactions = await TransactionModel.find({ member_id: memberId });
       const topUpTransactions = transactions.filter(tx => tx.transaction_type === 'Top up');
       const topUpCredits = topUpTransactions
         .filter(tx => tx.status === 'Completed' || tx.status === 'Approved')
         .reduce((acc, tx) => acc + (parseFloat(tx.ew_credit) || 0), 0);
       const topUpDebits = topUpTransactions
         .filter(tx => tx.status === 'Completed' || tx.status === 'Approved')
         .reduce((acc, tx) => acc + (parseFloat(tx.ew_debit) || 0), 0);
       currentBalance = Math.max(0, topUpCredits - topUpDebits);
    } else {
       return res.status(400).json({ success: false, message: "Invalid source wallet" });
    }

    if (transferAmount > currentBalance) {
      return res.status(400).json({ success: false, message: "Insufficient balance in " + fromWallet });
    }

    const lastTransaction = await TransactionModel.findOne({}).sort({ createdAt: -1 }).exec();
    let newTxId = 1;
    if (lastTransaction && lastTransaction.transaction_id) {
      const lastIdNum = parseInt(lastTransaction.transaction_id.replace(/\D/g, ""), 10) || 0;
      newTxId = lastIdNum + 1;
    }

    if (fromWallet === "Earnings" && toWallet === "Top Up Wallet") {
      // Create two transactions: one to debit earnings, one to credit top up
      const debitTx = new TransactionModel({
        transaction_id: newTxId.toString(),
        transaction_date: new Date(),
        member_id: memberId,
        description: `Wallet Transfer: Earnings to Top Up Wallet`,
        transaction_type: "Wallet Transfer",
        ew_credit: 0,
        ew_debit: transferAmount,
        uw_credit: 0,
        uw_debit: 0,
        status: "Completed",
        net_amount: transferAmount,
        gross_amount: transferAmount
      });
      await debitTx.save();

      const creditTx = new TransactionModel({
        transaction_id: (newTxId + 1).toString(),
        transaction_date: new Date(),
        member_id: memberId,
        description: `Wallet Transfer: Received from Earnings`,
        transaction_type: "Top up",
        ew_credit: transferAmount,
        ew_debit: 0,
        uw_credit: 0,
        uw_debit: 0,
        status: "Completed",
        net_amount: transferAmount,
        gross_amount: transferAmount
      });
      await creditTx.save();

      await MemberModel.findOneAndUpdate({ Member_id: memberId }, { 
        $inc: { wallet_balance: -transferAmount, top_up_wallet: transferAmount } 
      });

    } else if (fromWallet === "Top Up" && toWallet === "Upgrade Wallet") {
      const tx = new TransactionModel({
        transaction_id: newTxId.toString(),
        transaction_date: new Date(),
        member_id: memberId,
        description: `Wallet Transfer: Top Up to Upgrade Wallet`,
        transaction_type: "Top up", // Mark as top up so it counts as top up debit
        ew_credit: 0,
        ew_debit: transferAmount, 
        uw_credit: transferAmount,
        uw_debit: 0,
        status: "Completed",
        net_amount: transferAmount,
        gross_amount: transferAmount
      });
      await tx.save();

      await MemberModel.findOneAndUpdate({ Member_id: memberId }, { 
        $inc: { top_up_wallet: -transferAmount, upgrade_wallet: transferAmount } 
      });
    }

    return res.status(200).json({ success: true, message: "Transfer successful" });
  } catch (error) {
    console.error("Error in transferWallet:", error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

module.exports = { getWalletOverview, getWalletWithdraw, transferWallet, sendTransferOTP, sendWithdrawalOTP };