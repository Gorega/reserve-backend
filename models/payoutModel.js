const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema({
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },
  payoutMethod: {
    type: String,
    required: true,
    enum: ['bank_transfer', 'paypal', 'stripe']
  },
  accountDetails: {
    type: Object,
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  transactionId: {
    type: String
  },
  processedDate: {
    type: Date
  },
  notes: {
    type: String
  }
}, {
  timestamps: true
});

const Payout = mongoose.model('Payout', payoutSchema);

module.exports = Payout; 