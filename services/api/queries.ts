/**
 * GraphQL queries for the Payload CMS backend.
 *
 * These string constants define the queries used to fetch all program
 * configuration from the API. They are consumed by the client functions
 * in client.ts.
 */

export const ROTATIONS_QUERY = /* GraphQL */ `
  query Rotations($where: Rotation_where) {
    Rotations(where: $where, limit: 200) {
      docs {
        id
        title
        codename
        intensity
        outpatientPercentage
        color
        isFlexible
        isPlaceholder {
          id
          title
        }
        availableSince {
          id
          startingYear
        }
        availableUntil {
          id
          startingYear
        }
        tags {
          id
          title
        }
        staffingConfigurations {
          since {
            id
            startingYear
          }
          preferences {
            internCount
            seniorCount
          }
        }
      }
    }
  }
`

export const RESIDENTS_QUERY = /* GraphQL */ `
  query Residents($where: Resident_where) {
    Residents(where: $where, limit: 200) {
      docs {
        id
        firstName
        lastName
        displayName
        startYear {
          id
          startingYear
        }
        pgy3Year {
          id
          startingYear
        }
        joinDate
        leaveDate
        leaveReason
      }
    }
  }
`

export const CLINIC_CYCLES_QUERY = /* GraphQL */ `
  query ClinicCycles($where: ClinicCycle_where) {
    ClinicCycles(where: $where, limit: 200) {
      docs {
        id
        number
        label
        academicYear {
          id
          startingYear
        }
        residents {
          id
          displayName
        }
      }
    }
  }
`

export const ACADEMIC_YEAR_QUERY = /* GraphQL */ `
  query AcademicYear($where: AcademicYear_where) {
    AcademicYears(where: $where, limit: 10) {
      docs {
        id
        startingYear
        clinicWeeksPerCycle
        canonicalSchedule {
          id
        }
      }
    }
  }
`

export const ALL_ACADEMIC_YEARS_QUERY = /* GraphQL */ `
  query AllAcademicYears {
    AcademicYears(limit: 20) {
      docs {
        id
        startingYear
        canonicalSchedule {
          id
        }
      }
    }
  }
`

export const GRAD_REQUIREMENTS_QUERY = /* GraphQL */ `
  query GradRequirements($where: GradRequirement_where) {
    GradRequirements(where: $where, limit: 200) {
      docs {
        id
        tag {
          id
          title
        }
        source
        minimum
        maximum
        ideal
        pgy1Ideal
        pgy2Ideal
        pgy3Ideal
        academicYear {
          id
          startingYear
        }
      }
    }
  }
`

export const AVOIDANCE_RULES_QUERY = /* GraphQL */ `
  query AvoidanceRules($where: AvoidanceRule_where) {
    AvoidanceRules(where: $where, limit: 200) {
      docs {
        id
        resident {
          id
        }
        avoidedResident {
          id
        }
      }
    }
  }
`

export const TAGS_QUERY = /* GraphQL */ `
  query Tags {
    Tags(limit: 200) {
      docs {
        id
        title
      }
    }
  }
`

export const SCHEDULE_ASSIGNMENTS_QUERY = /* GraphQL */ `
  query ScheduleAssignments($where: ScheduleAssignment_where) {
    ScheduleAssignments(where: $where, limit: 10000) {
      docs {
        id
        schedule {
          id
          academicYear {
            startingYear
          }
        }
        resident {
          id
        }
        week
        rotation {
          codename
        }
        locked
      }
    }
  }
`

export const CREATE_SCHEDULE_MUTATION = /* GraphQL */ `
  mutation CreateSchedule($data: mutationScheduleInput!) {
    createSchedule(data: $data) {
      id
      title
    }
  }
`

export const CREATE_SCHEDULE_ASSIGNMENT_MUTATION = /* GraphQL */ `
  mutation CreateScheduleAssignment($data: mutationScheduleAssignmentInput!) {
    createScheduleAssignment(data: $data) {
      id
    }
  }
`

export const UPDATE_ACADEMIC_YEAR_MUTATION = /* GraphQL */ `
  mutation UpdateAcademicYear($id: Int!, $data: mutationAcademicYearUpdateInput!) {
    updateAcademicYear(id: $id, data: $data) {
      id
      canonicalSchedule {
        id
      }
    }
  }
`

// ── Sync-related queries and mutations ──

export const CANDIDATES_QUERY = /* GraphQL */ `
  query Candidates($where: Candidate_where) {
    Candidates(where: $where, limit: 20) {
      docs {
        id
        title
        status
        startingYear {
          id
          startingYear
        }
      }
    }
  }
`

export const CREATE_CANDIDATE_MUTATION = /* GraphQL */ `
  mutation CreateCandidate($data: mutationCandidateInput!) {
    createCandidate(data: $data) {
      id
      title
    }
  }
`

export const CANDIDATE_SCHEDULES_QUERY = /* GraphQL */ `
  query CandidateSchedules($where: Schedule_where) {
    Schedules(where: $where, limit: 20) {
      docs {
        id
        title
        academicYear {
          id
          startingYear
        }
        candidate {
          id
        }
      }
    }
  }
`

export const UPDATE_SCHEDULE_MUTATION = /* GraphQL */ `
  mutation UpdateSchedule($id: Int!, $data: mutationScheduleUpdateInput!) {
    updateSchedule(id: $id, data: $data) {
      id
      title
    }
  }
`

export const DELETE_SCHEDULE_MUTATION = /* GraphQL */ `
  mutation DeleteSchedule($id: Int!) {
    deleteSchedule(id: $id) {
      id
    }
  }
`

export const UPSERT_SCHEDULE_ASSIGNMENT_MUTATION = /* GraphQL */ `
  mutation UpsertScheduleAssignment($data: mutationScheduleAssignmentInput!) {
    createScheduleAssignment(data: $data) {
      id
    }
  }
`

export const DELETE_SCHEDULE_ASSIGNMENTS_BY_SCHEDULE = /* GraphQL */ `
  mutation DeleteScheduleAssignment($id: Int!) {
    deleteScheduleAssignment(id: $id) {
      id
    }
  }
`

export const FIND_ASSIGNMENT_QUERY = /* GraphQL */ `
  query FindAssignment($where: ScheduleAssignment_where) {
    ScheduleAssignments(where: $where, limit: 1) {
      docs {
        id
        schedule {
          id
        }
        resident {
          id
        }
        week
        rotation {
          id
          codename
        }
        locked
      }
    }
  }
`

export const UPDATE_SCHEDULE_ASSIGNMENT_MUTATION = /* GraphQL */ `
  mutation UpdateScheduleAssignment($id: Int!, $data: mutationScheduleAssignmentUpdateInput!) {
    updateScheduleAssignment(id: $id, data: $data) {
      id
    }
  }
`
