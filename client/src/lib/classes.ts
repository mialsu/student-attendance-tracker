export interface Class {
  id: string;
  name: string;
  description: string;
  teacherEmail: string;
  createdAt: string;
}

export interface ClassAttendanceRecord {
  id: string;
  classId: string;
  studentFirstName: string;
  studentLastName: string;
  timestamp: string;
}

// Class management functions
export const createClass = (name: string, description: string, teacherEmail: string): Class => {
  const classes = getClasses();
  const newClass: Class = {
    id: crypto.randomUUID(),
    name: name.trim(),
    description: description.trim(),
    teacherEmail,
    createdAt: new Date().toISOString(),
  };

  classes.push(newClass);
  localStorage.setItem('classes', JSON.stringify(classes));
  return newClass;
};

export const getClasses = (): Class[] => {
  return JSON.parse(localStorage.getItem('classes') || '[]');
};

export const getClassesByTeacher = (teacherEmail: string): Class[] => {
  const classes = getClasses();
  return classes
    .filter(c => c.teacherEmail === teacherEmail)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const getClassById = (classId: string): Class | undefined => {
  const classes = getClasses();
  return classes.find(c => c.id === classId);
};

export const updateClass = (classId: string, name: string, description: string): boolean => {
  const classes = getClasses();
  const index = classes.findIndex(c => c.id === classId);

  if (index === -1) return false;

  classes[index] = {
    ...classes[index],
    name: name.trim(),
    description: description.trim(),
  };

  localStorage.setItem('classes', JSON.stringify(classes));
  return true;
};

export const deleteClass = (classId: string): boolean => {
  const classes = getClasses();
  const filtered = classes.filter(c => c.id !== classId);

  if (filtered.length === classes.length) return false;

  localStorage.setItem('classes', JSON.stringify(filtered));

  // Also delete all attendance records for this class
  const records = getClassAttendanceRecords();
  const filteredRecords = records.filter(r => r.classId !== classId);
  localStorage.setItem('classAttendanceRecords', JSON.stringify(filteredRecords));

  return true;
};

// Class attendance functions
export const logClassAttendance = (
  classId: string,
  firstName: string,
  lastName: string
): ClassAttendanceRecord => {
  const records = getClassAttendanceRecords();
  const newRecord: ClassAttendanceRecord = {
    id: crypto.randomUUID(),
    classId,
    studentFirstName: firstName.trim(),
    studentLastName: lastName.trim(),
    timestamp: new Date().toISOString(),
  };

  records.push(newRecord);
  localStorage.setItem('classAttendanceRecords', JSON.stringify(records));
  return newRecord;
};

export const getClassAttendanceRecords = (): ClassAttendanceRecord[] => {
  return JSON.parse(localStorage.getItem('classAttendanceRecords') || '[]');
};

export const getAttendanceByClass = (classId: string): ClassAttendanceRecord[] => {
  const records = getClassAttendanceRecords();
  return records
    .filter(r => r.classId === classId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

export const getStudentAttendanceInClass = (
  classId: string,
  firstName: string,
  lastName: string
): ClassAttendanceRecord[] => {
  const records = getAttendanceByClass(classId);
  return records.filter(
    r => r.studentFirstName.toLowerCase() === firstName.toLowerCase() &&
         r.studentLastName.toLowerCase() === lastName.toLowerCase()
  );
};

export const getClassAttendanceSummary = (classId: string) => {
  const records = getAttendanceByClass(classId);
  const summary = new Map<string, { firstName: string; lastName: string; count: number }>();

  records.forEach(record => {
    const key = `${record.studentLastName.toLowerCase()}_${record.studentFirstName.toLowerCase()}`;
    if (summary.has(key)) {
      summary.get(key)!.count++;
    } else {
      summary.set(key, {
        firstName: record.studentFirstName,
        lastName: record.studentLastName,
        count: 1,
      });
    }
  });

  return Array.from(summary.values()).sort((a, b) =>
    a.lastName.localeCompare(b.lastName, 'fi')
  );
};

export const deleteAttendanceRecord = (recordId: string): boolean => {
  const records = getClassAttendanceRecords();
  const filtered = records.filter(r => r.id !== recordId);

  if (filtered.length === records.length) return false;

  localStorage.setItem('classAttendanceRecords', JSON.stringify(filtered));
  return true;
};
