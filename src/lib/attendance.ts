export interface AttendanceRecord {
  id: string;
  firstName: string;
  lastName: string;
  timestamp: string;
}

export const logAttendance = (firstName: string, lastName: string): AttendanceRecord => {
  const records = getAttendanceRecords();
  const newRecord: AttendanceRecord = {
    id: crypto.randomUUID(),
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    timestamp: new Date().toISOString(),
  };
  
  records.push(newRecord);
  localStorage.setItem('attendanceRecords', JSON.stringify(records));
  return newRecord;
};

export const getAttendanceRecords = (): AttendanceRecord[] => {
  return JSON.parse(localStorage.getItem('attendanceRecords') || '[]');
};

export const getStudentAttendanceCount = (firstName: string, lastName: string): number => {
  const records = getAttendanceRecords();
  return records.filter(
    r => r.firstName.toLowerCase() === firstName.toLowerCase() && 
         r.lastName.toLowerCase() === lastName.toLowerCase()
  ).length;
};

export const getStudentLogs = (firstName: string, lastName: string): AttendanceRecord[] => {
  const records = getAttendanceRecords();
  return records
    .filter(
      r => r.firstName.toLowerCase() === firstName.toLowerCase() && 
           r.lastName.toLowerCase() === lastName.toLowerCase()
    )
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

export const getAttendanceSummary = () => {
  const records = getAttendanceRecords();
  const summary = new Map<string, { firstName: string; lastName: string; count: number }>();
  
  records.forEach(record => {
    const key = `${record.lastName.toLowerCase()}_${record.firstName.toLowerCase()}`;
    if (summary.has(key)) {
      summary.get(key)!.count++;
    } else {
      summary.set(key, {
        firstName: record.firstName,
        lastName: record.lastName,
        count: 1,
      });
    }
  });
  
  return Array.from(summary.values()).sort((a, b) => 
    a.lastName.localeCompare(b.lastName, 'fi')
  );
};
