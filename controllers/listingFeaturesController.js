const db = require('../config/database');
const { errorHandler, notFound } = require('../utils/errorHandler');

/**
 * Listing Features Controller
 * Handles HTTP requests for amenities, house rules, safety features, and cancellation policies
 */
const listingFeaturesController = {
  /**
   * Get all amenities
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getAllAmenities(req, res, next) {
    try {
      const amenities = await db.query('SELECT * FROM amenities ORDER BY category, name');
      
      // Group amenities by category
      const groupedAmenities = amenities.reduce((acc, amenity) => {
        const category = amenity.category || 'Other';
        
        if (!acc[category]) {
          acc[category] = [];
        }
        
        acc[category].push(amenity);
        return acc;
      }, {});
      
      res.status(200).json({
        status: 'success',
        results: amenities.length,
        data: {
          amenities,
          groupedAmenities
        }
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Get amenity by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getAmenityById(req, res, next) {
    try {
      const { id } = req.params;
      
      const amenity = await db.getById('amenities', id);
      
      if (!amenity) {
        return res.status(404).json({
          status: 'error',
          message: 'Amenity not found'
        });
      }
      
      res.status(200).json({
        status: 'success',
        data: amenity
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Create amenity (admin only)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async createAmenity(req, res, next) {
    try {
      const amenityData = req.body;
      
      const result = await db.insert('amenities', amenityData);
      
      const amenity = await db.getById('amenities', result.insertId);
      
      res.status(201).json({
        status: 'success',
        data: amenity
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Update amenity (admin only)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updateAmenity(req, res, next) {
    try {
      const { id } = req.params;
      const amenityData = req.body;
      
      const amenity = await db.getById('amenities', id);
      
      if (!amenity) {
        return res.status(404).json({
          status: 'error',
          message: 'Amenity not found'
        });
      }
      
      await db.update('amenities', id, amenityData);
      
      const updatedAmenity = await db.getById('amenities', id);
      
      res.status(200).json({
        status: 'success',
        data: updatedAmenity
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Delete amenity (admin only)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async deleteAmenity(req, res, next) {
    try {
      const { id } = req.params;
      
      const amenity = await db.getById('amenities', id);
      
      if (!amenity) {
        return res.status(404).json({
          status: 'error',
          message: 'Amenity not found'
        });
      }
      
      // Check if amenity is in use
      const [usageCount] = await db.query(
        'SELECT COUNT(*) as count FROM listing_amenities WHERE amenity_id = ?',
        [id]
      );
      
      if (usageCount.count > 0) {
        return res.status(400).json({
          status: 'error',
          message: `Cannot delete amenity that is in use by ${usageCount.count} listings`
        });
      }
      
      await db.remove('amenities', id);
      
      res.status(204).end();
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Get all house rules
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getAllHouseRules(req, res, next) {
    try {
      const houseRules = await db.query('SELECT * FROM house_rules ORDER BY name');
      
      res.status(200).json({
        status: 'success',
        results: houseRules.length,
        data: houseRules
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Get house rule by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getHouseRuleById(req, res, next) {
    try {
      const { id } = req.params;
      
      const houseRule = await db.getById('house_rules', id);
      
      if (!houseRule) {
        return res.status(404).json({
          status: 'error',
          message: 'House rule not found'
        });
      }
      
      res.status(200).json({
        status: 'success',
        data: houseRule
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Create house rule (admin only)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async createHouseRule(req, res, next) {
    try {
      const houseRuleData = req.body;
      
      const result = await db.insert('house_rules', houseRuleData);
      
      const houseRule = await db.getById('house_rules', result.insertId);
      
      res.status(201).json({
        status: 'success',
        data: houseRule
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Update house rule (admin only)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updateHouseRule(req, res, next) {
    try {
      const { id } = req.params;
      const houseRuleData = req.body;
      
      const houseRule = await db.getById('house_rules', id);
      
      if (!houseRule) {
        return res.status(404).json({
          status: 'error',
          message: 'House rule not found'
        });
      }
      
      await db.update('house_rules', id, houseRuleData);
      
      const updatedHouseRule = await db.getById('house_rules', id);
      
      res.status(200).json({
        status: 'success',
        data: updatedHouseRule
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Delete house rule (admin only)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async deleteHouseRule(req, res, next) {
    try {
      const { id } = req.params;
      
      const houseRule = await db.getById('house_rules', id);
      
      if (!houseRule) {
        return res.status(404).json({
          status: 'error',
          message: 'House rule not found'
        });
      }
      
      // Check if house rule is in use
      const [usageCount] = await db.query(
        'SELECT COUNT(*) as count FROM listing_house_rules WHERE rule_id = ?',
        [id]
      );
      
      if (usageCount.count > 0) {
        return res.status(400).json({
          status: 'error',
          message: `Cannot delete house rule that is in use by ${usageCount.count} listings`
        });
      }
      
      await db.remove('house_rules', id);
      
      res.status(204).end();
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Get all safety features
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getAllSafetyFeatures(req, res, next) {
    try {
      const safetyFeatures = await db.query('SELECT * FROM safety_features ORDER BY name');
      
      res.status(200).json({
        status: 'success',
        results: safetyFeatures.length,
        data: safetyFeatures
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Get safety feature by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getSafetyFeatureById(req, res, next) {
    try {
      const { id } = req.params;
      
      const safetyFeature = await db.getById('safety_features', id);
      
      if (!safetyFeature) {
        return res.status(404).json({
          status: 'error',
          message: 'Safety feature not found'
        });
      }
      
      res.status(200).json({
        status: 'success',
        data: safetyFeature
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Create safety feature (admin only)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async createSafetyFeature(req, res, next) {
    try {
      const safetyFeatureData = req.body;
      
      const result = await db.insert('safety_features', safetyFeatureData);
      
      const safetyFeature = await db.getById('safety_features', result.insertId);
      
      res.status(201).json({
        status: 'success',
        data: safetyFeature
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Update safety feature (admin only)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updateSafetyFeature(req, res, next) {
    try {
      const { id } = req.params;
      const safetyFeatureData = req.body;
      
      const safetyFeature = await db.getById('safety_features', id);
      
      if (!safetyFeature) {
        return res.status(404).json({
          status: 'error',
          message: 'Safety feature not found'
        });
      }
      
      await db.update('safety_features', id, safetyFeatureData);
      
      const updatedSafetyFeature = await db.getById('safety_features', id);
      
      res.status(200).json({
        status: 'success',
        data: updatedSafetyFeature
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Delete safety feature (admin only)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async deleteSafetyFeature(req, res, next) {
    try {
      const { id } = req.params;
      
      const safetyFeature = await db.getById('safety_features', id);
      
      if (!safetyFeature) {
        return res.status(404).json({
          status: 'error',
          message: 'Safety feature not found'
        });
      }
      
      // Check if safety feature is in use
      const [usageCount] = await db.query(
        'SELECT COUNT(*) as count FROM listing_safety_features WHERE feature_id = ?',
        [id]
      );
      
      if (usageCount.count > 0) {
        return res.status(400).json({
          status: 'error',
          message: `Cannot delete safety feature that is in use by ${usageCount.count} listings`
        });
      }
      
      await db.remove('safety_features', id);
      
      res.status(204).end();
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Get all cancellation policies
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getAllCancellationPolicies(req, res, next) {
    try {
      const policies = await db.query('SELECT * FROM cancellation_policies ORDER BY name');
      
      res.status(200).json({
        status: 'success',
        results: policies.length,
        data: policies
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Get cancellation policy by name
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async getCancellationPolicyByName(req, res, next) {
    try {
      const { name } = req.params;
      
      const [policy] = await db.query(
        'SELECT * FROM cancellation_policies WHERE name = ?',
        [name]
      );
      
      if (!policy) {
        return res.status(404).json({
          status: 'error',
          message: 'Cancellation policy not found'
        });
      }
      
      res.status(200).json({
        status: 'success',
        data: policy
      });
    } catch (error) {
      next(errorHandler(error));
    }
  },
  
  /**
   * Update cancellation policy (admin only)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  async updateCancellationPolicy(req, res, next) {
    try {
      const { name } = req.params;
      const policyData = req.body;
      
      // Check if policy exists
      const [policy] = await db.query(
        'SELECT * FROM cancellation_policies WHERE name = ?',
        [name]
      );
      
      if (!policy) {
        return res.status(404).json({
          status: 'error',
          message: 'Cancellation policy not found'
        });
      }
      
      // Update policy
      await db.query(
        'UPDATE cancellation_policies SET ? WHERE name = ?',
        [policyData, name]
      );
      
      // Get updated policy
      const [updatedPolicy] = await db.query(
        'SELECT * FROM cancellation_policies WHERE name = ?',
        [name]
      );
      
      res.status(200).json({
        status: 'success',
        data: updatedPolicy
      });
    } catch (error) {
      next(errorHandler(error));
    }
  }
};

module.exports = listingFeaturesController; 