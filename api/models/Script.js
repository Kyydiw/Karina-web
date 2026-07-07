'use strict';

const mongoose = require('mongoose');

const scriptSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [140, 'Title must be at most 140 characters']
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true
    },
    version: {
      type: String,
      required: [true, 'Version is required'],
      trim: true,
      maxlength: [30, 'Version must be at most 30 characters']
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [5000, 'Description must be at most 5000 characters']
    },
    longDescription: {
      type: String,
      default: '',
      maxlength: [20000, 'Long description too long']
    },
    category: {
      type: String,
      required: true,
      enum: ['bot-script', 'plugin', 'module', 'utility', 'tutorial', 'other'],
      default: 'bot-script',
      index: true
    },
    tags: [
      {
        type: String,
        trim: true,
        maxlength: 30
      }
    ],
    fileName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    fileContent: {
      type: String,
      required: true
      // Stores UTF-8 text content (for .js/.json/.md files) or base64-encoded
      // binary content (when isBinary=true). 5MB practical limit enforced in controller.
    },
    isBinary: {
      type: Boolean,
      default: false
    },
    mimeType: {
      type: String,
      default: 'text/javascript'
    },
    fileSize: {
      type: Number,
      required: true,
      min: 0
    },
    downloadCount: {
      type: Number,
      default: 0,
      min: 0
    },
    viewCount: {
      type: Number,
      default: 0,
      min: 0
    },
    isFeatured: {
      type: Boolean,
      default: false,
      index: true
    },
    isPublished: {
      type: Boolean,
      default: true,
      index: true
    },
    changelog: {
      type: String,
      default: '',
      maxlength: [10000, 'Changelog too long']
    },
    externalUrl: {
      type: String,
      default: '',
      trim: true
    },
    thumbnailUrl: {
      type: String,
      default: '',
      trim: true
    },
    uploadedBy: {
      type: String,
      default: 'admin'
    }
  },
  {
    timestamps: true,
    collection: 'scripts'
  }
);

scriptSchema.index({ createdAt: -1 });
scriptSchema.index({ title: 'text', description: 'text', tags: 'text' });
scriptSchema.index({ category: 1, createdAt: -1 });

module.exports = mongoose.models.Script || mongoose.model('Script', scriptSchema);
