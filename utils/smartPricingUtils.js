const { badRequest } = require('./errorHandler');

/**
 * Smart Pricing Utilities
 * Handles intelligent pricing calculations based on pricing_options
 */
const smartPricingUtils = {
  /**
   * Calculate smart pricing based on listing's pricing options
   * @param {Object} listing - Listing object with pricing_options
   * @param {Date} startDate - Start date/time
   * @param {Date} endDate - End date/time
   * @param {string} preferredUnitType - Preferred unit type (optional)
   * @returns {Object} - Pricing calculation result
   */
  calculateSmartPrice(listing, startDate, endDate, preferredUnitType = null) {
    if (!listing || !listing.pricing_options || !Array.isArray(listing.pricing_options) || listing.pricing_options.length === 0) {
      throw badRequest('Listing has no pricing options available');
    }

    const durationInMs = endDate - startDate;
    const durationInHours = durationInMs / (1000 * 60 * 60);
    const durationInDays = durationInMs / (1000 * 60 * 60 * 24);

    // Find the best pricing option based on duration and unit type
    const bestPricingOption = this.findBestPricingOption(
      listing.pricing_options, 
      durationInHours, 
      durationInDays, 
      preferredUnitType
    );

    if (!bestPricingOption) {
      throw badRequest('No suitable pricing option found for the selected duration');
    }

    // Calculate the number of units needed based on the pricing option
    const calculationResult = this.calculateUnitsAndPrice(
      bestPricingOption, 
      durationInHours, 
      durationInDays
    );

    return {
      pricingOption: bestPricingOption,
      unitsNeeded: calculationResult.unitsNeeded,
      totalUnits: calculationResult.totalUnits,
      basePrice: calculationResult.basePrice,
      pricePerUnit: bestPricingOption.price,
      unitType: bestPricingOption.unit_type,
      duration: bestPricingOption.duration,
      minimumUnits: bestPricingOption.minimum_units,
      maximumUnits: bestPricingOption.maximum_units,
      effectiveDuration: calculationResult.effectiveDuration
    };
  },

  /**
   * Find the best pricing option for given duration
   * @param {Array} pricingOptions - Array of pricing options
   * @param {number} durationInHours - Duration in hours
   * @param {number} durationInDays - Duration in days
   * @param {string} preferredUnitType - Preferred unit type
   * @returns {Object|null} - Best pricing option
   */
  findBestPricingOption(pricingOptions, durationInHours, durationInDays, preferredUnitType = null) {
    // First, try to find an option that matches the preferred unit type
    if (preferredUnitType) {
      const preferredOption = pricingOptions.find(option => option.unit_type === preferredUnitType);
      if (preferredOption && this.isValidForDuration(preferredOption, durationInHours, durationInDays)) {
        return preferredOption;
      }
    }

    // Sort options by efficiency (best value per unit of time)
    const viableOptions = pricingOptions.filter(option => 
      this.isValidForDuration(option, durationInHours, durationInDays)
    );

    if (viableOptions.length === 0) {
      return null;
    }

    // Calculate efficiency for each viable option
    const optionsWithEfficiency = viableOptions.map(option => {
      const calculation = this.calculateUnitsAndPrice(option, durationInHours, durationInDays);
      return {
        ...option,
        efficiency: calculation.basePrice / calculation.effectiveDuration,
        basePrice: calculation.basePrice
      };
    });

    // Sort by efficiency (lower is better) and then by whether it's the default option
    optionsWithEfficiency.sort((a, b) => {
      // Prioritize default option if efficiency is close (within 10%)
      if (Math.abs(a.efficiency - b.efficiency) / Math.min(a.efficiency, b.efficiency) <= 0.1) {
        if (a.is_default && !b.is_default) return -1;
        if (!a.is_default && b.is_default) return 1;
      }
      return a.efficiency - b.efficiency;
    });

    return optionsWithEfficiency[0];
  },

  /**
   * Check if a pricing option is valid for the given duration
   * @param {Object} option - Pricing option
   * @param {number} durationInHours - Duration in hours
   * @param {number} durationInDays - Duration in days
   * @returns {boolean} - Whether the option is valid
   */
  isValidForDuration(option, durationInHours, durationInDays) {
    let durationInUnits;
    
    switch (option.unit_type) {
      case 'hour':
      case 'session':
        durationInUnits = Math.ceil(durationInHours / option.duration);
        break;
      case 'day':
      case 'night':
        durationInUnits = Math.ceil(durationInDays / option.duration);
        break;
      case 'week':
        durationInUnits = Math.ceil(durationInDays / (7 * option.duration));
        break;
      case 'month':
        durationInUnits = Math.ceil(durationInDays / (30 * option.duration));
        break;
      default:
        return false;
    }

    // Check minimum and maximum unit constraints
    if (durationInUnits < option.minimum_units) {
      return false;
    }

    if (option.maximum_units && durationInUnits > option.maximum_units) {
      return false;
    }

    return true;
  },

  /**
   * Calculate units needed and total price for a pricing option
   * @param {Object} option - Pricing option
   * @param {number} durationInHours - Duration in hours
   * @param {number} durationInDays - Duration in days
   * @returns {Object} - Calculation result
   */
  calculateUnitsAndPrice(option, durationInHours, durationInDays) {
    let durationInUnits;
    let effectiveDurationInHours;

    switch (option.unit_type) {
      case 'hour':
      case 'session':
        durationInUnits = Math.ceil(durationInHours / option.duration);
        effectiveDurationInHours = durationInUnits * option.duration;
        break;
      case 'day':
      case 'night':
        durationInUnits = Math.ceil(durationInDays / option.duration);
        effectiveDurationInHours = durationInUnits * option.duration * 24;
        break;
      case 'week':
        durationInUnits = Math.ceil(durationInDays / (7 * option.duration));
        effectiveDurationInHours = durationInUnits * option.duration * 7 * 24;
        break;
      case 'month':
        durationInUnits = Math.ceil(durationInDays / (30 * option.duration));
        effectiveDurationInHours = durationInUnits * option.duration * 30 * 24;
        break;
      default:
        throw badRequest(`Unsupported unit type: ${option.unit_type}`);
    }

    // Apply minimum units constraint
    const totalUnits = Math.max(durationInUnits, option.minimum_units);
    
    // Recalculate effective duration if minimum units is applied
    let effectiveDuration;
    switch (option.unit_type) {
      case 'hour':
      case 'session':
        effectiveDuration = totalUnits * option.duration;
        break;
      case 'day':
      case 'night':
        effectiveDuration = totalUnits * option.duration;
        break;
      case 'week':
        effectiveDuration = totalUnits * option.duration;
        break;
      case 'month':
        effectiveDuration = totalUnits * option.duration;
        break;
    }

    const basePrice = totalUnits * option.price;

    return {
      unitsNeeded: durationInUnits,
      totalUnits,
      basePrice,
      effectiveDuration,
      effectiveDurationInHours
    };
  },

  /**
   * Get smart duration constraints for a pricing option
   * @param {Object} pricingOption - Pricing option
   * @returns {Object} - Duration constraints
   */
  getDurationConstraints(pricingOption) {
    const { unit_type, duration, minimum_units, maximum_units } = pricingOption;
    
    let minDurationInHours, maxDurationInHours;
    let stepDurationInHours;

    switch (unit_type) {
      case 'hour':
      case 'session':
        minDurationInHours = minimum_units * duration;
        maxDurationInHours = maximum_units ? maximum_units * duration : null;
        stepDurationInHours = duration;
        break;
      case 'day':
      case 'night':
        minDurationInHours = minimum_units * duration * 24;
        maxDurationInHours = maximum_units ? maximum_units * duration * 24 : null;
        stepDurationInHours = duration * 24;
        break;
      case 'week':
        minDurationInHours = minimum_units * duration * 7 * 24;
        maxDurationInHours = maximum_units ? maximum_units * duration * 7 * 24 : null;
        stepDurationInHours = duration * 7 * 24;
        break;
      case 'month':
        minDurationInHours = minimum_units * duration * 30 * 24;
        maxDurationInHours = maximum_units ? maximum_units * duration * 30 * 24 : null;
        stepDurationInHours = duration * 30 * 24;
        break;
      default:
        throw badRequest(`Unsupported unit type: ${unit_type}`);
    }

    return {
      minDurationInHours,
      maxDurationInHours,
      stepDurationInHours,
      minUnits: minimum_units,
      maxUnits: maximum_units,
      unitType: unit_type,
      duration
    };
  },

  /**
   * Suggest optimal end time based on pricing option constraints
   * @param {Date} startDate - Start date
   * @param {Object} pricingOption - Pricing option
   * @returns {Date} - Suggested end date
   */
  suggestOptimalEndTime(startDate, pricingOption) {
    const constraints = this.getDurationConstraints(pricingOption);
    const suggestedEndDate = new Date(startDate);
    
    // Add minimum duration
    suggestedEndDate.setTime(startDate.getTime() + (constraints.minDurationInHours * 60 * 60 * 1000));
    
    return suggestedEndDate;
  }
};

module.exports = smartPricingUtils;

