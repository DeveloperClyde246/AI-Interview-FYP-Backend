const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const Interview = require("../models/Interview");
const Notification = require("../models/Notification");
const mongoose = require("mongoose");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const cloudinary = require("../config/cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const axios = require("axios");
const Candidate = require("../models/candidate");

const router = express.Router();

//convert to mp4
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);
const FormData = require("form-data");
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');


// Ensure only candidates can access these routes
router.use(authMiddleware(["candidate"]));

//---------------dashbooard page------------------//
// ✅ Candidate Dashboard - Get notifications and interviews
router.get("/", async (req, res) => {
  try {
    const candidateId = new mongoose.Types.ObjectId(req.user.id);

    // Fetch notifications for the candidate
    const notifications = await Notification.find({ userId: candidateId }).sort({
      createdAt: -1,
    });

    // Fetch interviews where the candidate is assigned
    const interviews = await Interview.find({ candidates: candidateId })
      .populate("recruiterId", "name email")
      .sort({ scheduled_date: -1 });

    res.json({ username: req.cookies.username, notifications, interviews });
  } catch (error) {
    console.error("❌ Error loading candidate dashboard:", error.message);
    res.status(500).json({ message: "Error loading dashboard" });
  }
});

// ✅ Get Notification Details
router.get("/notifications/:id", async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ message: "Notification not found" });

    res.json({ notification });
  } catch (error) {
    console.error("❌ Error fetching notification details:", error.message);
    res.status(500).json({ message: "Error fetching notification details" });
  }
});

// Delete Notification
router.delete("/notifications/:id/delete", async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    // If the notification relates to an interview, check the interviewDate.
    if (notification.interviewDate) {
      const interviewDate = new Date(notification.interviewDate);
      const now = new Date();
      const timeDiff = interviewDate - now;
      // If the interview is in the future and is within 24 hours, prevent deletion.
      if (timeDiff > 0 && timeDiff <= 24 * 60 * 60 * 1000) {
        return res.status(403).json({
          message:
            "You cannot delete this notification because the interview is happening within 24 hours.",
        });
      }
    }
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ message: "Notification deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting notification:", error.message);
    res.status(500).json({ message: "Error deleting notification" });
  }
});


//---------------profile pages------------------//
// ✅ Get Candidate Profile
router.get("/profile", async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    const candidateProfile = await Candidate.findOne({ userId: req.user.id });

    res.json({
      candidate: {
        ...user.toObject(),
        ...candidateProfile?.toObject(),
      },
    });
  } catch (error) {
    console.error("❌ Error loading profile:", error.message);
    res.status(500).json({ message: "Error loading profile" });
  }
});

// ✅ Update Profile
router.post("/profile/edit", async (req, res) => {
  const {
    name,
    email,
    roleApplied,
    skills,
    introduction,
    education,
    contactNumber,
  } = req.body;

  try {
    await User.findByIdAndUpdate(req.user.id, { name, email });

    let candidate = await Candidate.findOne({ userId: req.user.id });
    if (!candidate) {
      candidate = new Candidate({ userId: req.user.id });
    }

    candidate.roleApplied = roleApplied;
    candidate.skills = skills;
    candidate.introduction = introduction;
    candidate.education = education;
    candidate.contactNumber = contactNumber;

    await candidate.save();

    res.status(200).json({ message: "Profile updated successfully" });
  } catch (error) {
    console.error("❌ Error updating profile:", error.message);
    res.status(500).json({ message: "Error updating profile" });
  }
});


// ✅ Update Candidate Password
router.post("/profile/edit-password", async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    const candidate = await User.findById(req.user.id);

    // Check if current password is correct
    const isMatch = await bcrypt.compare(currentPassword, candidate.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Incorrect current password" });
    }

    // Hash new password and update
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(req.user.id, { password: hashedPassword });

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("❌ Error updating password:", error.message);
    res.status(500).json({ message: "Error updating password" });
  }
});



//---------------answer pages------------------//
// ✅ Get Assigned Interviews
router.get("/interviews", async (req, res) => {
  try {
    const candidateId = new mongoose.Types.ObjectId(req.user.id);

    const interviews = await Interview.find({ candidates: candidateId })
      .populate("recruiterId", "name email")
      .sort({ scheduled_date: -1 });

    const interviewsWithStatus = interviews.map((interview) => {
      const response = interview.responses.find(
        (res) => res.candidate.toString() === candidateId.toString()
      );
    
      return {
        ...interview.toObject(),
        alreadySubmitted: !!response,
        status: response ? response.status : "pending"
      };
    });

    res.json({ interviews: interviewsWithStatus });
  } catch (error) {
    console.error("❌ Error fetching interviews:", error.message);
    res.status(500).json({ message: "Error fetching interviews" });
  }
});


// ✅ Get Interview Details and Status
router.get("/interview/:id", async (req, res) => {
  try {
    const candidateId = req.user.id;

    // ✅ Populate recruiter details
    const interview = await Interview.findById(req.params.id).populate("recruiterId", "name email");

    if (!interview) {
      return res.status(404).json({ message: "Interview not found" });
    }

    // ✅ Find candidate response (if any)
    const response = interview.responses.find(
      (res) => res.candidate.toString() === candidateId
    );

    const status = response?.status || "pending";
    const submitDateTime = response?.submitDateTime || null;

    res.json({ interview, status, submitDateTime }); // ✅ Include submitDateTime
  } catch (error) {
    console.error("❌ Error fetching interview:", error.message);
    res.status(500).json({ message: "Error fetching interview" });
  }
});



// ✅ Get Interview Results
router.get("/interview/:id/results", async (req, res) => {
  try {
    const candidateId = req.user.id;
    const interview = await Interview.findById(req.params.id)
      .populate("recruiterId", "name email");

    if (!interview) {
      return res.status(404).json({ message: "Interview not found" });
    }

    const response = interview.responses.find(
      (res) => res.candidate.toString() === candidateId
    );

    if (!response) {
      return res.status(404).json({ message: "You have not submitted this interview." });
    }

    res.json({
      title: interview.title,
      recruiter: interview.recruiterId,
      questions: interview.questions,
      answers: response.answers,
      videoMarks: response.videoMarks,
      averageMark: response.marks,
      submitDateTime: response.submitDateTime,
      status: response.status,
    });
  } catch (err) {
    console.error("❌ Error fetching result:", err.message);
    res.status(500).json({ message: "Error fetching result" });
  }
});


// ✅ Submit Interview Answers setup
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "interview_responses",
    resource_type: "auto",
    format: async (req, file) => file.mimetype.split("/")[1],
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // Allow up to 200MB file uploads
});

// ✅ Submit Interview Answers
router.post("/interview/:id/submit", upload.array("fileAnswers", 5), async (req, res) => {
  try {
    const candidateId = req.user.id;
    let processedAnswers = [];
    let videoURLs = [];

    // ✅ Check if the candidate has already submitted a response
    const interview = await Interview.findById(req.params.id);
    if (!interview) {
      return res.status(404).json({ message: "Interview not found" });
    }

    const existingResponse = interview.responses.find(
      (response) => response.candidate.toString() === candidateId
    );

    if (existingResponse) {
      return res.status(400).json({ message: "You have already submitted answers for this interview." });
    }

    // ✅ Process file uploads
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        processedAnswers.push(file.path);
      }
    }

    if (req.body.answers) {
      for (const answer of req.body.answers) {
        processedAnswers.push(answer);
    
        if (answer.startsWith("http") && answer.includes("video/upload")) {
          // Convert to mp4 via Cloudinary transformation
          const mp4URL = answer
            .replace("/upload/", "/upload/f_mp4/")
            .replace(".webm", ".mp4"); // Optional, just for consistency
    
          videoURLs.push(mp4URL);
        }
      }
    }

    const submittedAt = new Date();
    const scheduledTime = new Date(interview.scheduled_date);
    const isLate = submittedAt > scheduledTime;

    // ✅ Save response with null marks initially
    const newResponse = {
      candidate: candidateId,
      answers: processedAnswers,
      videoMarks: [],
      marks: null,
      status: isLate ? "submitted late" : "submitted", // ✅ set status here
      submitDateTime: submittedAt,
    };

    interview.responses.push(newResponse);
    await interview.save();

    // ✅ Analyze video responses
    let videoMarks = [];


    const tempDir = path.join(__dirname, "../temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    for (const url of videoURLs) {
      try {
        // 1. Download the webm video
        const tempWebmPath = path.join(__dirname, "../temp", `${uuidv4()}.webm`);
        const writer = fs.createWriteStream(tempWebmPath);
        const videoStream = await axios.get(url, { responseType: "stream" });
        await new Promise((resolve, reject) => {
          videoStream.data.pipe(writer);
          writer.on("finish", resolve);
          writer.on("error", reject);
        });
    
        // 2. Convert to MP4
        const tempMp4Path = tempWebmPath.replace(".webm", ".mp4");
        await new Promise((resolve, reject) => {
          ffmpeg(tempWebmPath)
            .output(tempMp4Path)
            .on("end", resolve)
            .on("error", reject)
            .run();
        });
        
        const form = new FormData();
        form.append("video", fs.createReadStream(tempMp4Path));

        const aiRes = await axios.post("http://localhost:5001/analyze-video", form, {
          headers: form.getHeaders(),
          timeout: 18000000,
        });
        // // 3. Send to Flask AI API
        // const aiRes = await axios.post("http://localhost:5001/analyze-video", {
        //   videoURL: `file://${tempMp4Path}`, // or use fs.readFile if API accepts buffer
        // }, { timeout: 60000 });
    
        const { marks } = aiRes.data;
        videoMarks.push(marks);
    
        // 4. Cleanup temp files
        fs.unlinkSync(tempWebmPath);
        fs.unlinkSync(tempMp4Path);
    
      } catch (err) {
        console.error("❌ AI error or FFmpeg error:", err.message);
      }
    }

    // ✅ Calculate average mark
    const avgMark = videoMarks.length > 0 ? Math.round(videoMarks.reduce((a, b) => a + b, 0) / videoMarks.length) : null;

    // ✅ Update response with marks
    await Interview.findOneAndUpdate(
      { _id: req.params.id, "responses.candidate": candidateId },
      {
        $set: {
          "responses.$.videoMarks": videoMarks,
          "responses.$.marks": avgMark,
        },
      },
      { new: true }
    );

    res.json({ message: "Answers submitted successfully", avgMark });
  } catch (error) {
    console.error("❌ Error submitting answers:", error.message);
    res.status(500).json({ message: "Error submitting answers" });
  }
});


//---------------faq pages------------------//
// ✅ Get FAQ Details
router.get("/faq", (req, res) => {
  res.json({ message: "FAQ Page Loaded" });
});

module.exports = router;
