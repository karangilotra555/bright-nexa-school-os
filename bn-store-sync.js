(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BrightNexaStoreSync = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const ROMAN_MAP = {
    'i': '1', 'ii': '2', 'iii': '3', 'iv': '4', 'v': '5',
    'vi': '6', 'vii': '7', 'viii': '8', 'ix': '9', 'x': '10',
    'xi': '11', 'xii': '12'
  };

  function normalizeClassName(name) {
    if (name === null || name === undefined) return '';
    let s = String(name).trim().toLowerCase();
    if (!s) return '';

    // Remove common prefixes: "class ", "grade ", "batch ", "std ", "standard "
    s = s.replace(/^(class|grade|batch|std|standard)\s*[-:]?\s*/i, '');

    // Extract leading part if combined like "6 - A" or "6th A"
    const hyphenParts = s.split(/\s*[-–—]\s*/);
    if (hyphenParts.length > 1 && /^\d+$/.test(hyphenParts[0].trim())) {
      s = hyphenParts[0].trim();
    }

    // Remove ordinal suffixes e.g. 1st, 2nd, 3rd, 4th, 6th, 10th
    s = s.replace(/^(\d+)(st|nd|rd|th)$/i, '$1');

    // Convert roman numerals to arabic
    if (ROMAN_MAP[s]) {
      s = ROMAN_MAP[s];
    }

    return s.trim();
  }

  function normalizeSection(sec) {
    if (sec === null || sec === undefined) return '';
    let s = String(sec).trim().toLowerCase();
    if (!s) return '';
    s = s.replace(/^(sec|section)\s*[-:]?\s*/i, '');
    return s.trim();
  }

  function isClassMatch(classA, classB) {
    if (!classA || !classB) return false;
    if (classA === classB) return true;
    const na = normalizeClassName(classA);
    const nb = normalizeClassName(classB);
    return !!na && na === nb;
  }

  function isSectionMatch(secA, secB) {
    if (!secA && !secB) return true;
    if (secA === 'All' || secB === 'All' || !secA || !secB) return true;
    if (secA === secB) return true;
    return normalizeSection(secA) === normalizeSection(secB);
  }

  function isStudentInClass(student, classRecord) {
    if (!student || !classRecord) return false;
    
    const classMatches = isClassMatch(student.className, classRecord.name);
    if (!classMatches) return false;

    if (classRecord.section) {
      const secA = normalizeSection(student.section);
      const secB = normalizeSection(classRecord.section);
      if (secA && secB && secA !== secB) {
        return false;
      }
    }

    if (classRecord.academicStream && student.academicStream) {
      if (classRecord.academicStream.toLowerCase() !== student.academicStream.toLowerCase()) {
        return false;
      }
    }

    return true;
  }

  function bnCascadeClassroomChanges(oldClasses = [], newClasses = [], students = [], operations = {}) {
    const oldMap = new Map((oldClasses || []).map(c => [c.id, c]));
    let updatedStudents = [...(students || [])];
    let updatedFeeStructures = [...(operations.feeStructures || [])];
    let updatedAttendance = [...(operations.attendance || [])];
    let updatedTeachers = [...(operations.teachers || [])];
    let updatedTimetable = Array.isArray(operations.timetable) ? [...operations.timetable] : [];
    let changesCount = 0;

    for (const newClass of (newClasses || [])) {
      const oldClass = oldMap.get(newClass.id);
      if (!oldClass) continue;

      const nameChanged = oldClass.name !== newClass.name;
      const secChanged = oldClass.section !== newClass.section;
      const streamChanged = (oldClass.academicStream || '') !== (newClass.academicStream || '');

      if (!nameChanged && !secChanged && !streamChanged) {
        continue;
      }

      changesCount++;

      // 1. Cascade to Students
      updatedStudents = updatedStudents.map(student => {
        const matchesOld = isClassMatch(student.className, oldClass.name) &&
          (!oldClass.section || isSectionMatch(student.section, oldClass.section));

        if (matchesOld) {
          return {
            ...student,
            className: newClass.name,
            section: newClass.section || student.section,
            academicStream: newClass.academicStream || student.academicStream
          };
        }
        return student;
      });

      // 2. Cascade to Fee Structures
      updatedFeeStructures = updatedFeeStructures.map(fs => {
        if (isClassMatch(fs.className, oldClass.name)) {
          return {
            ...fs,
            className: newClass.name,
            academicStream: newClass.academicStream || fs.academicStream
          };
        }
        return fs;
      });

      // 3. Cascade to Attendance Records
      updatedAttendance = updatedAttendance.map(att => {
        const matchesOld = isClassMatch(att.className, oldClass.name) &&
          (!oldClass.section || isSectionMatch(att.section, oldClass.section));

        if (matchesOld) {
          return {
            ...att,
            className: newClass.name,
            section: newClass.section || att.section
          };
        }
        return att;
      });

      // 4. Cascade to Teachers' assignedClasses
      const oldKey = `${oldClass.name}-${oldClass.section}`;
      const newKey = `${newClass.name}-${newClass.section}`;
      updatedTeachers = updatedTeachers.map(teacher => {
        if (Array.isArray(teacher.assignedClasses) && teacher.assignedClasses.length > 0) {
          const hasOld = teacher.assignedClasses.some(ac => 
            ac === oldKey || 
            (isClassMatch(ac.split('-')[0], oldClass.name) && isSectionMatch(ac.split('-')[1], oldClass.section))
          );
          if (hasOld) {
            const newAssigned = teacher.assignedClasses.map(ac => {
              if (ac === oldKey || (isClassMatch(ac.split('-')[0], oldClass.name) && isSectionMatch(ac.split('-')[1], oldClass.section))) {
                return newKey;
              }
              return ac;
            });
            return { ...teacher, assignedClasses: Array.from(new Set(newAssigned)) };
          }
        }
        return teacher;
      });

      // 5. Cascade to Timetable if present
      if (updatedTimetable.length > 0) {
        updatedTimetable = updatedTimetable.map(item => {
          if (isClassMatch(item.className, oldClass.name) && (!oldClass.section || isSectionMatch(item.section, oldClass.section))) {
            return {
              ...item,
              className: newClass.name,
              section: newClass.section || item.section
            };
          }
          return item;
        });
      }
    }

    const updatedOperations = {
      ...operations,
      classes: newClasses,
      feeStructures: updatedFeeStructures,
      attendance: updatedAttendance,
      teachers: updatedTeachers,
      ...(updatedTimetable.length ? { timetable: updatedTimetable } : {})
    };

    return {
      updatedStudents,
      updatedOperations,
      changesCount
    };
  }

  function bnCascadeStudentChanges(updatedStudent, oldStudent = null, operations = {}) {
    if (!updatedStudent || !updatedStudent.id) return { updatedOperations: operations };

    let updatedAttendance = [...(operations.attendance || [])];
    let updatedFeePayments = [...(operations.feePayments || [])];
    let updatedMarks = [...(operations.marks || [])];
    let touched = false;

    // 1. Attendance update
    updatedAttendance = updatedAttendance.map(att => {
      if (att.studentId === updatedStudent.id) {
        touched = true;
        return {
          ...att,
          studentName: updatedStudent.name || att.studentName,
          rollNumber: updatedStudent.rollNumber || att.rollNumber,
          className: updatedStudent.className || att.className,
          section: updatedStudent.section || att.section
        };
      }
      return att;
    });

    // 2. Fee payments update
    updatedFeePayments = updatedFeePayments.map(fp => {
      if (fp.studentId === updatedStudent.id) {
        touched = true;
        return {
          ...fp,
          studentName: updatedStudent.name || fp.studentName,
          admissionNumber: updatedStudent.admissionNumber || fp.admissionNumber,
          className: updatedStudent.className || fp.className,
          section: updatedStudent.section || fp.section
        };
      }
      return fp;
    });

    // 3. Marks update
    updatedMarks = updatedMarks.map(m => {
      if (m.studentId === updatedStudent.id) {
        touched = true;
        return {
          ...m,
          studentName: updatedStudent.name || m.studentName,
          className: updatedStudent.className || m.className,
          section: updatedStudent.section || m.section
        };
      }
      return m;
    });

    return {
      touched,
      updatedOperations: {
        ...operations,
        attendance: updatedAttendance,
        feePayments: updatedFeePayments,
        marks: updatedMarks
      }
    };
  }

  function buildDynamicClassList(configuredClasses = [], studentList = [], includeStandards = true) {
    const standardOrder = ['nursery', 'lkg', 'ukg', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    const seen = new Set();
    const result = [];

    function addClass(rawName) {
      if (!rawName) return;
      const trimmed = String(rawName).trim();
      if (!trimmed) return;
      const norm = normalizeClassName(trimmed);
      if (!seen.has(norm)) {
        seen.add(norm);
        result.push(trimmed);
      }
    }

    (configuredClasses || []).forEach(c => addClass(c.name));
    (studentList || []).forEach(s => addClass(s.className));
    if (includeStandards || result.length === 0) {
      ['Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].forEach(addClass);
    }

    result.sort((a, b) => {
      const na = normalizeClassName(a);
      const nb = normalizeClassName(b);
      const idxA = standardOrder.indexOf(na);
      const idxB = standardOrder.indexOf(nb);

      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });

    return result;
  }

  function buildDynamicSectionList(selectedClass, configuredClasses = [], studentList = []) {
    const set = new Set();
    const normSelected = normalizeClassName(selectedClass);

    (configuredClasses || []).forEach(c => {
      if (c.section && normalizeClassName(c.name) === normSelected) {
        set.add(c.section.trim());
      }
    });

    (studentList || []).forEach(s => {
      if (s.section && normalizeClassName(s.className) === normSelected) {
        set.add(s.section.trim());
      }
    });

    if (set.size === 0) {
      return ['A'];
    }

    return Array.from(set).sort();
  }

  return {
    normalizeClassName,
    normalizeSection,
    isClassMatch,
    isSectionMatch,
    isStudentInClass,
    bnCascadeClassroomChanges,
    bnCascadeStudentChanges,
    buildDynamicClassList,
    buildDynamicSectionList
  };
});
