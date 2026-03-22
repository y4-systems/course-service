const Course = require("../models/Course");

const {
  getEnrollmentCount,
  checkEnrollmentStatus
} = require("../services/externalServices");
// GET /courses
const getAllCourses = async (req, res) => {
  try {
    const courses = await Course.find().sort({ createdAt: -1 });
    res.json(courses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /courses/:id
const getCourseById = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // call enrollment service
    const enrolledCount = await getEnrollmentCount(req.params.id);

    res.json({
      ...course.toObject(),
      enrolled_count: enrolledCount ?? "unavailable",
      available_seats:
        enrolledCount !== null ? course.capacity - enrolledCount : "unavailable"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /courses
const createCourse = async (req, res) => {
  let { name, description, capacity, credits } = req.body;

  if (!name || !capacity || !credits) {
    return res.status(400).json({
      error: "name, capacity, and credits are required"
    });
  }

  capacity = Number(capacity);
  credits = Number(credits);

  if (isNaN(capacity) || isNaN(credits)) {
    return res.status(400).json({
      error: "capacity and credits must be numbers"
    });
  }

  try {
    const course = await Course.create({
      name: String(name),
      description: String(description || ""),
      capacity,
      credits
    });

    res.status(201).json(course);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /courses/:id
const updateCourse = async (req, res) => {
  const { name, description, credits } = req.body;
  try {
    const course = await Course.findByIdAndUpdate(
      req.params.id,
      {
        ...(name && { name }),
        ...(description && { description }),
        ...(credits && { credits })
      },
      { new: true }
    );
    if (!course) return res.status(404).json({ error: "Course not found" });
    res.json(course);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /courses/:id/capacity — called by Enrollment Service
const updateCapacity = async (req, res) => {
  const { action } = req.body;
  if (!["increment", "decrement"].includes(action)) {
    return res
      .status(400)
      .json({ error: "action must be 'increment' or 'decrement'" });
  }
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ error: "Course not found" });

    if (action === "decrement") {
      const enrolledCount = await getEnrollmentCount(req.params.id);
      const count = enrolledCount ?? course.capacity - 1;
      if (count >= course.capacity) {
        return res
          .status(400)
          .json({ error: "Course is full — no available capacity" });
      }
    }

    course.capacity += action === "increment" ? 1 : -1;
    await course.save();
    res.json(course);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// GET /courses/:courseId/check-student/:studentId

const checkStudentEnrollment = async (req, res) => {
  try {
    const { courseId, studentId } = req.params;
    const status = await checkEnrollmentStatus(studentId, courseId);

    if (!status) {
      return res.status(503).json({
        error: "Enrollment service unavailable"
      });
    }

    res.json({
      courseId,
      studentId,
      enrolled: status.isEnrolled ?? false,
      enrollmentStatus: status.status ?? null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getAllCourses,
  getCourseById,
  createCourse,
  updateCourse,
  updateCapacity,
  checkStudentEnrollment
};
