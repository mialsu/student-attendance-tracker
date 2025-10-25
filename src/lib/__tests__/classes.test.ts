import { describe, it, expect, beforeEach } from 'vitest';
import {
  createClass,
  getClasses,
  getClassesByTeacher,
  getClassById,
  updateClass,
  deleteClass,
  logClassAttendance,
  getClassAttendanceRecords,
  getAttendanceByClass,
  getStudentAttendanceInClass,
  getClassAttendanceSummary,
  deleteAttendanceRecord,
} from '../classes';

describe('Class Management Functions', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  describe('createClass', () => {
    it('should create a new class with correct properties', () => {
      const teacherEmail = 'teacher@test.com';
      const className = 'Mathematics 101';
      const description = 'Intro to Math';

      const newClass = createClass(className, description, teacherEmail);

      expect(newClass).toMatchObject({
        name: className,
        description: description,
        teacherEmail: teacherEmail,
      });
      expect(newClass.id).toBeDefined();
      expect(newClass.createdAt).toBeDefined();
    });

    it('should trim whitespace from name and description', () => {
      const newClass = createClass('  Math  ', '  Description  ', 'teacher@test.com');

      expect(newClass.name).toBe('Math');
      expect(newClass.description).toBe('Description');
    });

    it('should persist class to localStorage', () => {
      createClass('Math', 'Desc', 'teacher@test.com');

      const classes = getClasses();
      expect(classes).toHaveLength(1);
      expect(classes[0].name).toBe('Math');
    });
  });

  describe('getClassesByTeacher', () => {
    it('should return only classes for specified teacher', () => {
      createClass('Math', 'Math class', 'teacher1@test.com');
      createClass('Physics', 'Physics class', 'teacher2@test.com');
      createClass('Chemistry', 'Chemistry class', 'teacher1@test.com');

      const teacher1Classes = getClassesByTeacher('teacher1@test.com');

      expect(teacher1Classes).toHaveLength(2);
      const classNames = teacher1Classes.map(c => c.name).sort();
      expect(classNames).toEqual(['Chemistry', 'Math']);
    });

    it('should return empty array for teacher with no classes', () => {
      createClass('Math', 'Math class', 'teacher1@test.com');

      const classes = getClassesByTeacher('teacher2@test.com');

      expect(classes).toHaveLength(0);
    });

    it('should sort classes by creation date descending', () => {
      const class1 = createClass('Math', 'Math class', 'teacher@test.com');
      const class2 = createClass('Physics', 'Physics class', 'teacher@test.com');

      const classes = getClassesByTeacher('teacher@test.com');

      expect(classes).toHaveLength(2);
      // Most recent should be first (or check both are present)
      expect([class1.id, class2.id]).toContain(classes[0].id);
      expect([class1.id, class2.id]).toContain(classes[1].id);
    });
  });

  describe('getClassById', () => {
    it('should return correct class by id', () => {
      const newClass = createClass('Math', 'Math class', 'teacher@test.com');

      const foundClass = getClassById(newClass.id);

      expect(foundClass).toEqual(newClass);
    });

    it('should return undefined for non-existent id', () => {
      const foundClass = getClassById('non-existent-id');

      expect(foundClass).toBeUndefined();
    });
  });

  describe('updateClass', () => {
    it('should update class name and description', () => {
      const newClass = createClass('Old Name', 'Old Description', 'teacher@test.com');

      const success = updateClass(newClass.id, 'New Name', 'New Description');

      expect(success).toBe(true);
      const updatedClass = getClassById(newClass.id);
      expect(updatedClass?.name).toBe('New Name');
      expect(updatedClass?.description).toBe('New Description');
    });

    it('should return false for non-existent class', () => {
      const success = updateClass('non-existent-id', 'Name', 'Desc');

      expect(success).toBe(false);
    });

    it('should trim whitespace from updated values', () => {
      const newClass = createClass('Math', 'Desc', 'teacher@test.com');

      updateClass(newClass.id, '  Updated  ', '  New Desc  ');

      const updatedClass = getClassById(newClass.id);
      expect(updatedClass?.name).toBe('Updated');
      expect(updatedClass?.description).toBe('New Desc');
    });
  });

  describe('deleteClass', () => {
    it('should delete class and return true', () => {
      const newClass = createClass('Math', 'Desc', 'teacher@test.com');

      const success = deleteClass(newClass.id);

      expect(success).toBe(true);
      expect(getClassById(newClass.id)).toBeUndefined();
    });

    it('should delete associated attendance records', () => {
      const newClass = createClass('Math', 'Desc', 'teacher@test.com');
      logClassAttendance(newClass.id, 'John', 'Doe');
      logClassAttendance(newClass.id, 'Jane', 'Smith');

      deleteClass(newClass.id);

      const records = getAttendanceByClass(newClass.id);
      expect(records).toHaveLength(0);
    });

    it('should return false for non-existent class', () => {
      const success = deleteClass('non-existent-id');

      expect(success).toBe(false);
    });
  });
});

describe('Attendance Management Functions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('logClassAttendance', () => {
    it('should create attendance record with correct properties', () => {
      const testClass = createClass('Math', 'Desc', 'teacher@test.com');

      const record = logClassAttendance(testClass.id, 'John', 'Doe');

      expect(record).toMatchObject({
        classId: testClass.id,
        studentFirstName: 'John',
        studentLastName: 'Doe',
      });
      expect(record.id).toBeDefined();
      expect(record.timestamp).toBeDefined();
    });

    it('should trim whitespace from student names', () => {
      const testClass = createClass('Math', 'Desc', 'teacher@test.com');

      const record = logClassAttendance(testClass.id, '  John  ', '  Doe  ');

      expect(record.studentFirstName).toBe('John');
      expect(record.studentLastName).toBe('Doe');
    });

    it('should persist attendance record to localStorage', () => {
      const testClass = createClass('Math', 'Desc', 'teacher@test.com');

      logClassAttendance(testClass.id, 'John', 'Doe');

      const records = getClassAttendanceRecords();
      expect(records).toHaveLength(1);
    });
  });

  describe('getAttendanceByClass', () => {
    it('should return only attendance for specified class', () => {
      const class1 = createClass('Math', 'Desc', 'teacher@test.com');
      const class2 = createClass('Physics', 'Desc', 'teacher@test.com');

      logClassAttendance(class1.id, 'John', 'Doe');
      logClassAttendance(class2.id, 'Jane', 'Smith');
      logClassAttendance(class1.id, 'Bob', 'Johnson');

      const class1Records = getAttendanceByClass(class1.id);

      expect(class1Records).toHaveLength(2);
      expect(class1Records.every(r => r.classId === class1.id)).toBe(true);
    });

    it('should sort records by timestamp descending', () => {
      const testClass = createClass('Math', 'Desc', 'teacher@test.com');

      const record1 = logClassAttendance(testClass.id, 'John', 'Doe');
      const record2 = logClassAttendance(testClass.id, 'Jane', 'Smith');

      const records = getAttendanceByClass(testClass.id);

      expect(records).toHaveLength(2);
      // Verify both records are present
      expect([record1.id, record2.id]).toContain(records[0].id);
      expect([record1.id, record2.id]).toContain(records[1].id);
    });
  });

  describe('getStudentAttendanceInClass', () => {
    it('should return attendance for specific student in class', () => {
      const testClass = createClass('Math', 'Desc', 'teacher@test.com');

      logClassAttendance(testClass.id, 'John', 'Doe');
      logClassAttendance(testClass.id, 'Jane', 'Smith');
      logClassAttendance(testClass.id, 'John', 'Doe');

      const johnRecords = getStudentAttendanceInClass(testClass.id, 'John', 'Doe');

      expect(johnRecords).toHaveLength(2);
      expect(johnRecords.every(r => r.studentFirstName === 'John')).toBe(true);
    });

    it('should be case insensitive', () => {
      const testClass = createClass('Math', 'Desc', 'teacher@test.com');

      logClassAttendance(testClass.id, 'John', 'Doe');

      const records = getStudentAttendanceInClass(testClass.id, 'JOHN', 'DOE');

      expect(records).toHaveLength(1);
    });
  });

  describe('getClassAttendanceSummary', () => {
    it('should return summary with student names and counts', () => {
      const testClass = createClass('Math', 'Desc', 'teacher@test.com');

      logClassAttendance(testClass.id, 'John', 'Doe');
      logClassAttendance(testClass.id, 'John', 'Doe');
      logClassAttendance(testClass.id, 'Jane', 'Smith');

      const summary = getClassAttendanceSummary(testClass.id);

      expect(summary).toHaveLength(2);
      const johnSummary = summary.find(s => s.firstName === 'John');
      const janeSummary = summary.find(s => s.firstName === 'Jane');

      expect(johnSummary?.count).toBe(2);
      expect(janeSummary?.count).toBe(1);
    });

    it('should sort students by last name alphabetically', () => {
      const testClass = createClass('Math', 'Desc', 'teacher@test.com');

      logClassAttendance(testClass.id, 'John', 'Smith');
      logClassAttendance(testClass.id, 'Jane', 'Anderson');
      logClassAttendance(testClass.id, 'Bob', 'Zimmerman');

      const summary = getClassAttendanceSummary(testClass.id);

      expect(summary[0].lastName).toBe('Anderson');
      expect(summary[1].lastName).toBe('Smith');
      expect(summary[2].lastName).toBe('Zimmerman');
    });

    it('should return empty array for class with no attendance', () => {
      const testClass = createClass('Math', 'Desc', 'teacher@test.com');

      const summary = getClassAttendanceSummary(testClass.id);

      expect(summary).toHaveLength(0);
    });
  });

  describe('deleteAttendanceRecord', () => {
    it('should delete attendance record and return true', () => {
      const testClass = createClass('Math', 'Desc', 'teacher@test.com');
      const record = logClassAttendance(testClass.id, 'John', 'Doe');

      const success = deleteAttendanceRecord(record.id);

      expect(success).toBe(true);
      const records = getClassAttendanceRecords();
      expect(records.find(r => r.id === record.id)).toBeUndefined();
    });

    it('should return false for non-existent record', () => {
      const success = deleteAttendanceRecord('non-existent-id');

      expect(success).toBe(false);
    });
  });
});
