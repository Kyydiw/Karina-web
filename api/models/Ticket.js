'use strict';

const mongoose = require('mongoose');

const ticketMessageSchema = new mongoose.Schema(
  {
    sender: {
      type: String,
      required: true,
      enum: ['user', 'admin', 'system']
    },
    senderName: {
      type: String,
      default: ''
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: [5000, 'Message must be at most 5000 characters']
    },
    attachments: [
      {
        fileName: String,
        fileUrl: String
      }
    ]
  },
  { timestamps: true, _id: true }
);

const ticketSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      trim: true,
      maxlength: [200, 'Subject must be at most 200 characters']
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [5000, 'Description must be at most 5000 characters']
    },
    category: {
      type: String,
      required: true,
      enum: ['general', 'bug-report', 'feature-request', 'script-issue', 'account', 'billing', 'other'],
      default: 'general',
      index: true
    },
    priority: {
      type: String,
      required: true,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium'
    },
    status: {
      type: String,
      required: true,
      enum: ['open', 'in-progress', 'resolved', 'closed'],
      default: 'open',
      index: true
    },
    // Guest ticket creator info (no full account needed)
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 80
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      maxlength: 120,
      index: true
    },
    // Optional contact info
    whatsapp: {
      type: String,
      default: '',
      trim: true,
      maxlength: 30
    },
    // Token used to authenticate the ticket holder (sent in confirmation)
    accessToken: {
      type: String,
      required: true,
      index: true
    },
    // IP/UA tracking for abuse prevention
    createdIp: {
      type: String,
      default: ''
    },
    createdUserAgent: {
      type: String,
      default: ''
    },
    messages: [ticketMessageSchema],
    // Admin who is currently handling this ticket
    assignedTo: {
      type: String,
      default: ''
    },
    // Tags for organization
    tags: [
      {
        type: String,
        trim: true,
        maxlength: 30
      }
    ],
    // When status became resolved/closed
    resolvedAt: {
      type: Date,
      default: null
    },
    closedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    collection: 'tickets'
  }
);

ticketSchema.index({ createdAt: -1 });
ticketSchema.index({ status: 1, createdAt: -1 });
ticketSchema.index({ email: 1, createdAt: -1 });

module.exports = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);
