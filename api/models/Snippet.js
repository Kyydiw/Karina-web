'use strict';

const mongoose = require('mongoose');

const snippetSchema = new mongoose.Schema(
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
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [2000, 'Description must be at most 2000 characters']
    },
    language: {
      type: String,
      required: true,
      enum: ['javascript', 'typescript', 'json', 'html', 'css', 'bash', 'python', 'markdown', 'plaintext'],
      default: 'javascript',
      index: true
    },
    code: {
      type: String,
      required: [true, 'Code is required'],
      maxlength: [50000, 'Code must be at most 50000 characters']
    },
    tags: [
      {
        type: String,
        trim: true,
        maxlength: 30
      }
    ],
    author: {
      type: String,
      default: 'admin',
      trim: true,
      maxlength: 60
    },
    viewCount: {
      type: Number,
      default: 0,
      min: 0
    },
    copyCount: {
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
    }
  },
  {
    timestamps: true,
    collection: 'snippets'
  }
);

snippetSchema.index({ createdAt: -1 });
snippetSchema.index({ title: 'text', description: 'text', tags: 'text' });
snippetSchema.index({ language: 1, createdAt: -1 });

module.exports = mongoose.models.Snippet || mongoose.model('Snippet', snippetSchema);
