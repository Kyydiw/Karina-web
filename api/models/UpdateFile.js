'use strict';

const mongoose = require('mongoose');

const updateFileSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [120, 'Title must be at most 120 characters']
    },
    version: {
      type: String,
      required: [true, 'Version is required'],
      trim: true,
      maxlength: [20, 'Version must be at most 20 characters']
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [2000, 'Description must be at most 2000 characters']
    },
    changelogLink: {
      type: String,
      trim: true,
      default: ''
    }
  },
  {
    timestamps: true,
    collection: 'update_files'
  }
);

updateFileSchema.index({ createdAt: -1 });

module.exports = mongoose.models.UpdateFile || mongoose.model('UpdateFile', updateFileSchema);