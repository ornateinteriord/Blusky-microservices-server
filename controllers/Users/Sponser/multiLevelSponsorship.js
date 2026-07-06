const MemberModel = require("../../../models/Users/Member");

/**
 * Get multi-level sponsorship data for a member
 * Returns data for up to 15 levels of sponsorship
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Response with sponsorship data for up to 15 levels
 */
const getMultiLevelSponsorship = async (req, res) => {
  try {
    // Get member ID from authenticated user token or route parameter
    const memberId = req.user?.memberId || req.user?.id || req.params?.id;
    
    if (!memberId) {
      return res.status(400).json({ success: false, message: "Member ID is required" });
    }

    // Array to store level-wise data
    const levelData = [];
    const MAX_LEVELS = 15;

    // Process each level
    let currentLevelMemberIds = [memberId];
    
    for (let level = 1; level <= MAX_LEVELS; level++) {
      if (currentLevelMemberIds.length === 0) break;
      
      // Find all members sponsored by current level members across all sponsor field variants
      const nextLevelMembers = await MemberModel.find({ 
        $or: [
          { Sponsor_code: { $in: currentLevelMemberIds } },
          { sponsor_id: { $in: currentLevelMemberIds } },
          { introducer: { $in: currentLevelMemberIds } }
        ]
      });
      
      if (nextLevelMembers.length === 0) break;
      
      // Count active and pending members (case-insensitive check)
      const activeCount = nextLevelMembers.filter(member => 
        member.status === "active" || member.status === "Active" || member.status === "APPROVED"
      ).length;
      const pendingCount = nextLevelMembers.length - activeCount;
      
      // Add level data to result
      levelData.push({
        level,
        total: nextLevelMembers.length,
        active: activeCount,
        pending: pendingCount,
      });
      
      // Set up next level member IDs supporting both uppercase and lowercase properties
      currentLevelMemberIds = nextLevelMembers
        .map(member => member.Member_id || member.member_id)
        .filter(Boolean);
    }
    
    return res.status(200).json({
      success: true,
      data: levelData
    });
    
  } catch (error) {
    console.error("Error in getMultiLevelSponsorship:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};

module.exports = { getMultiLevelSponsorship };